////////
//
// IDEA
//
//    don't do RPC through message bus!
//
//    use the message bus to submit a request for information
//      request includes replyTo queue
//      request includes replyTo url
//
//    response checks response size
//      response size larger than threshold it sends directly to url
//      response size smaller than threshold it sends to queue
//
//    event collaboration workflow:
//      emits event
//      listener of emitted event wants to retrieve information
//        listener initiates an RPC call to the service
//        service responds directly to micoservice
//
//        This all gets handled by the framework an looks like a standard listen event!!!
//
//
//    ! services that WANT the data, queue events so that R/R is made via round robin
//    ! IE: if 10 services want the data, 10 services emit the event so that one service doesn't get slammed
//
//    ! PROBLEM STILL EXISTS WITH PUSHING DATA!
//    ! Small enough payload should get pushed immediately <4k
//    ! Larger payloads need to be stored in a way that all similar nodes can access the data
//
//
//
//    Example - concept extraction request
//      CLIENT initiates a request to extract concepts
//      GATEWAY receives this request via HTTP POST
//      GATEWAY emit concept-extract-request event
//      FILE SERVICE listens for concept-extract-request event
//      FILE SERVICE emits file-available event
//      TEXT SERVICE listens for file-available event
//        TEXT SERVICE emits file-available-rpc event
//        FILE SERVICE listens for file-available-rpc event
//        FILE SERVICE makes direct HTTP POST of data to TEXT SERVICE
//        TEXT SERVICE recieves POST data and triggers callback with received data
//
//    Example - file upload
//      CLIENT initiates a file upload via REST calls to GATEWAY
//      GATEWAY receives a file via standard HTTP POST
//      GATEWAY stores file in a shared location that it can manage?
//      GATEWAY emits file-upload-request event, supplies its CALLBACK QUEUE???
//      FILE SERVICE listens for file-upload-request event
//      FILE SERVICE
//
///////////////////
//
// TODO
//
//  - failed req/res requeue
//  - deadlettering
//  - correlationId collisions in callback hash
//  - pipe senddata requests directly to exchange
//  - remove express
//  - add middleware
//  - add configuration for caching

import http from 'http';
import amqp from 'amqplib';
import redis from 'redis';
import uuid from 'node-uuid';
import express from 'express';
import bodyParser from 'body-parser';
import Debug from 'debug';
const traceCore = Debug('framework:core');
const traceListener = Debug('framework:trace-list');
const traceEmitter = Debug('framework:trace-emit');

const convertToBuffer = (result) => {
  let type;
  let data;

  if(result instanceof Buffer) {
    type = 'buffer';
    data = result;
  }
  else if(typeof result === 'object') {
    type = 'object';
    data = new Buffer(JSON.stringify(result));
  }
  else {
    type = typeof result;
    data = new Buffer(result);
  }
  return Buffer.concat([ new Buffer(type), data ]);
};

const convertFromBuffer = (buffer) => {
  let text = buffer.toString();
  let result;

  if(text.startsWith('buffer')) {
    result = new Buffer(text.substring('buffer'.length));
  }
  else if(text.startsWith('object')) {
    result = text.substring('object'.length);
    result = JSON.parse(result);
  }
  else {
    result = text.substring('string'.length);
  }
  return result;
};


export default class {

    /**
   * [construtor description]
   * @param  {[type]} options.name        [description]
   * @param  {String} options.appExchange [description]
   * @return {[type]}                     [description]
   */
  constructor({ name, appExchange = 'app' }) {
    this.name = name;
    this.appExchange = appExchange;
    this._callbacks = {};
    this._broker;
    this._channel;
    this._app;
    traceCore('created service %s', name);
  }

  /**
   * Starts the service by connecting to the broker
   * binding the replyTo queue and attaching all listeners
   * @param  {[type]} brokerPath [description]
   * @return {[type]}            [description]
   */
  async start({ brokerPath, redisUrl, httpHost, httpPort }) {
    this._broker = await amqp.connect('amqp://' + brokerPath);
    this._channel = await this._broker.createChannel();
    traceCore('connected to RabbitMQ %s', brokerPath);

    // connect to redis
    this._redis = redis.createClient('redis://' + redisUrl);
    traceCore('connected to Redis %s', redisUrl);

    // setup express
    const app = this._app = express();
    this.httpHost = httpHost;
    this.httpPort = httpPort || (Math.floor(Math.random() * 50000) + 10000);
    app.use(bodyParser.json({}));
    app.post('/receive', (req, res, next) => this._onReceiveData(req, res).catch(next));
    app.listen(this.httpPort, () => traceCore('express listening on port %d', this.httpPort));


    // setup service exchange and queue
    const channel = this._channel;
    const appExchange = this.appExchange;
    await channel.assertExchange(appExchange, 'fanout');
    await channel.assertExchange(this.name, 'topic');
    await channel.bindExchange(this.name, this.appExchange, '');
    await channel.assertQueue(this.name, { durable: true });
  }

  /**
   * Stops the service
   * @return {[type]} [description]
   */
  async stop() {
    this._broker.close();
    this._app.close();
    this._redis.close();
  }

  /**
   * Gets the connected channel
   * @return {[type]} [description]
   */
  channel() {
    if(!this._channel) {
      throw new Error('Execute start before attempting to use framework');
    }
    return this._channel;
  }

  async _onReceiveData(req, res) {
    const data = convertFromBuffer(new Buffer(req.body.data.data));
    const {correlationId} = req.body;
    traceListener('http data received for %s', correlationId);

    if(this._callbacks[correlationId]) {
      res.end();

      // allow response to end before executing callback
      setImmediate(() => {
        this._callbacks[correlationId](data);
        delete this._callbacks[correlationId];
      });
    } else {
      res.status(404).end();
    }
  }

  async emit(event, data, { correlationId = uuid.v4() } = {}) {
    const channel = this.channel();
    const serviceExchange = this.name;
    const sendDataEvent = event + '.senddata';
    const sendDataQueue = event + '.senddata';
    channel.assertQueue(sendDataQueue);
    channel.bindQueue(sendDataQueue, serviceExchange, sendDataQueue);
    channel.consume(sendDataQueue, (msg) => this._onSendDataRequest(msg));
    traceCore('listens to %s', sendDataQueue);

    this._writeToCache(correlationId, data);
    const headers = { sendDataEvent };
    channel.publish(this.appExchange, event, new Buffer(''), { correlationId, headers });
    traceEmitter('emitted %s', event);
  }

  // bind to event.senddata
  async _onSendDataRequest(msg) {
    traceEmitter('received %s event for %s', msg.fields.routingKey, msg.properties.correlationId);
    const channel = this.channel();
    const correlationId = msg.properties.correlationId;
    const replyHost = msg.properties.headers.replyHost;
    const replyPort = msg.properties.headers.replyPort;
    traceEmitter('sending data to %s:%s', replyHost, replyPort);
    try
    {
      const cacheValue = await this._readFromCache(correlationId);
      const buffer = JSON.stringify({ data: convertToBuffer(cacheValue), correlationId });
      const req = http.request({
        host: replyHost,
        port: replyPort,
        path: '/receive',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': buffer.length
        }
      }, (res) => {
        // TODO requeue original on failure
        traceEmitter('sent data with statusCode %s', res.statusCode);
      });
      req.write(buffer);
      req.end();
    }
    catch(ex) {
      // TODO requeue original on failure
      console.log(ex.stack);
    }
    channel.ack(msg);
  }

  async _readFromCache(key) {
    return new Promise((resolve, reject) => {
      this._redis.get(key, (err, reply) => {
        if(err) reject(err);
        else {
          let strJson = reply;
          let json = JSON.parse(strJson);
          let data = json.data;
          resolve(data);
        }
      });
    });
  }

  async _writeToCache(key, data) {
    return new Promise((resolve, reject) => {
      let json = { data: data };
      let strJson = JSON.stringify(json);
      this._redis.set(key, strJson, (err, reply) => {
        if(err) reject(err);
        else this._redis.expire(key, 60, (err2) => {
            if(err2) reject(err2);
            else resolve(reply);
          });
      });
    });
  }

    /**
   * Binds the method to the event for listening
   * @private
   */
  async on(event, processMsg, { concurrent = 0 } = {}) {
    const channel = this.channel();
    const exchange = this.name;
    const queue = event;

    await channel.assertQueue(event, { durable: false, autoDelete: true, deadLetterExchange: 'deadletter' });
    await channel.bindQueue(queue, exchange, event);

    if(concurrent > 0)
      await channel.prefetch(concurrent);

    channel.consume(event, (msg) => this._listenMsg(event, msg, processMsg).catch(err => console.log(err.stack)));
    traceCore('listens to %s', event);
  }

  /**
   * @private
   * @param  {[type]} event      [description]
   * @param  {[type]} msg        [description]
   * @param  {[type]} processMsg [description]
   * @return {[type]}            [description]
   */
  async _listenMsg(event, msg, processMsg) {
    let correlationId = msg.properties.correlationId;
    let sendDataEvent = msg.properties.headers.sendDataEvent;
    let channel = this.channel();
    traceListener('listened to %s %s', event, correlationId);

    try {

      // emit the data request event and await for direct response
      let input = await this._emitDataRequest({ sendDataEvent, correlationId });

      // generate scoped emit
      let emit = (event, data) => this.emit(event, data, { correlationId });

      // processing message
      traceListener('processing message');
      await processMsg(input, { ctx: this, emit: emit, event: event, msg: msg });

      // ack the message so that prefetch works
      await channel.ack(msg);
    }
    catch(ex) {
      console.log('Listen failure: %s', ex.stack);

      // ack the message as complete
      channel.nack(msg, false, false);
    }
  }

  async _emitDataRequest({ sendDataEvent, correlationId }) {
    traceListener('emitting %s for %s', sendDataEvent, correlationId);
    let channel = this.channel();
    let appExchange = this.appExchange;
    let headers = {
      replyHost: this.httpHost,
      replyPort: this.httpPort
    };
    return new Promise((resolve) => {
      this._callbacks[correlationId] = (data) => resolve(data);
      channel.publish(appExchange, sendDataEvent, new Buffer(''), { correlationId, headers });
      traceListener('emitted data request %s with %j', sendDataEvent, headers);
    });
  }
}