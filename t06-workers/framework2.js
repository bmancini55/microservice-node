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
//

import http from 'http';
import amqp from 'amqplib';
import redis from 'redis';
import uuid from 'node-uuid';
import express from 'express';
import bodyParser from 'body-parser';
import Debug from 'debug';
const debug = Debug('framework');

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
    debug('created service %s', name);
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
    debug('connected to RabbitMQ %s', brokerPath);

    // connect to redis
    this._redis = redis.createClient('redis://' + redisUrl);
    debug('connected to Redis %s', redisUrl);

    // setup express
    const app = this._app = express();
    this._httphost = httpHost;
    this._httpport = httpPort;
    app.use(bodyParser.json({}));
    app.post('/receive', (req, res, next) => this._onHttpRequest(req, res).catch(next));
    app.listen(httpPort, () => debug('express listening on port %d', httpPort));


    // setup service exchange and queue
    const channel = this._channel;
    channel.assertExchange(this.appExchange, 'fanout');
    channel.assertExchange(this.name, 'topic');
    channel.bindExchange(this.name, this.appExchange, '');
    channel.assertQueue(this.name, { durable: true });
  }

  /**
   * Stops the service
   * @return {[type]} [description]
   */
  async stop() {
    this._broker.close();
    this._app.close();
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

  _onHttpRequest(req, res) {
    const {data} = req.body;
    const {correlationId} = req.body;

    if(this._callbacks[correlationId]) {
      this._callbacks[correlationId](data);
      delete this._callbacks[correlationId];
      res.end();
    } else {
      res.status(404).end();
    }
  }

  async emit(event, data, { correlationId = uuid.v4() } = {}) {
    const channel = this.channel();
    const buffer = convertToBuffer(data);
    const serviceExchange = this.name;
    const sendDataEvent = event + '.senddata';
    const sendDataQueue = event + '.senddata';
    channel.assertQueue(sendDataQueue);
    channel.bindQueue(sendDataQueue, serviceExchange, sendDataQueue);
    channel.consume(this.name, this._onSendData);

    // if(buffer.length <= 1024) {
    //   channel.publish(this.appExchange, event, buffer, { correlationId });
    // }
    // else {

      this._writeToCache(correlationId, buffer);
      const headers = { sendDataEvent };
      channel.publish(this.appExchange, event, new Buffer(''), { correlationId, headers });

    //}
  }

  // bind to event.senddata
  async _onSendData(msg) {
    const channel = this.channel();
    const correlationId = msg.properties.correlationId;
    const replyHost = msg.properties.headers.replyHost;
    const replyPort = msg.properties.headers.replyPort;
    try
    {
      const buffer = this._readFromCache(correlationId);
      const req = http.send({
        host: replyHost,
        port: replyPort,
        path: '/receive',
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': buffer.length
        }
      }, (res) => {
        // TODO requeue original on failure
        console.log(res.status);
      });
      req.write(buffer);
      req.end();
    }
    catch(ex) {
      // TODO requeue original on failure
      console.log(ex.status);
    }
    channel.ack(msg);
  }

  async _readFromCache(key) {
    return new Promise((resolve, reject) => {
      this._redis.get(key, (err, reply) => {
        if(err) reject(err);
        else    resolve(reply);
      });
    });
  }

  async _writeToCache(key, data) {
    return new Promise((resolve, reject) => {
      this._redis.set(key, data, (err, reply) => {
        if(err) reject(err);
        else this._redis.expire(key, 60, (err2) => {
            if(err2) reject(err2);
            else resolve(reply);
          });
      });
    });
  }
}