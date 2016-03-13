
let amqp = require('amqplib');
let uuid = require('node-uuid');

module.exports = factory;

function factory(opts) {
  return new App(opts);
}

class App {

  /**
   * [constructor description]
   */
  constructor({ name } = {}) {
    this.name = name;
    this._callbacks = {};
    this._deferredHandler = [];
    this._deferredListener = [];
    this._broker;
    this._channel;
    this._callbackQueue;
  }

  /**
   * Starts listening to RabbitMQ and connects to the callback queue
   * and asserts that the main exchange is avaia
   * @public
   */
  async start(brokerPath) {
    this._broker = await amqp.connect(brokerPath);
    this._channel = await this._broker.createChannel();
    console.log('Connected to %s', brokerPath);

    // Create the callback queue and start listening to it.
    // This will eventually get bound to topics that match correlationIds that the
    // current service listens to.
    this._callbackQueue = await this._channel.assertQueue('', { exclusive: true });
    this._channel.consume(this._callbackQueue.queue, (msg) => {
      let correlationId = msg.properties.correlationId;
      console.log(' [f] completed %s', correlationId);
      if(this._callbacks[correlationId]) {
        let value = _convertFromBuffer(msg.content);
        this._callbacks[correlationId](value);
      }
    }, { noAck: true });

    // deferred handlers
    for(let binding of this._deferredHandler) {
      this._handler(binding.event, binding.processMsg, binding.concurrent);
    }

    // deferred listeners
    for(let binding of this._deferredListener) {
      this._listener(binding.event, binding.processMsg, binding.concurrent);
    }

    // this should be applied to middleware!
    this._configDeadletter();

    console.log('Service has successfully started');
  }

  /**
   * Adds deadletter listener to the current node
   * @return {[type]} [description]
   */
  async _configDeadletter() {
    this._channel.assertExchange('deadletter', 'fanout', { durable: false });
    this._channel.assertQueue('deadletter', { autoDelete: false });
    this._channel.bindQueue('deadletter', 'deadletter', '');

    this._channel.consume('deadletter', (msg) => this._handleDeadletter(msg).catch(console.log));
  }

  /**
   * Handle a deadletter message by replyig with a failure back to the original
   * requestor, publishing a general error event back into the app, and
   * nacking the message as a failure (this last part may not be necessary if there
   * already a failure).
   *
   * We may need to add some filtering here to prevent .error and .complete calls
   * from entering this queue.
   */
  async _handleDeadletter(msg) {
    let correlationId = msg.properties.correlationId;
    let routingKey = msg.fields.routingKey;
    let replyTo = msg.properties.replyTo;
    let event = msg.properties.type;
    let buffer = _convertToBuffer('Deadlettered');
    console.log(' [x] handling deadletter for %s %s', routingKey, correlationId)

    if(replyTo)
      this._channel.sendToQueue(replyTo, buffer, { correlationId });

    // publishing an error event will create a retain if no-one is listening
    //this._channel.publish('app', event + '.error', buffer, { correlationId });
    this._channel.nack(msg, false, false);
  }

  /**
   * Handles an event and responds with a value
   * @param  {[type]} event      [description]
   * @param  {[type]} processMsg [description]
   * @param  {[type]} concurrent [description]
   * @return {[type]}            [description]
   */
  async handle(event, processMsg, concurrent = 1) {
    // if not connecet, defer the binding till it's connected
    if(!this._channel)
      this._deferredHandler.push({ event, processMsg, concurrent });

    // when connected just bind things
    else
      this._handler(event, processMsg, concurrent);
  }

  /**
   * Listens for an event and does not respond with a value
   * @param  {[type]} event      [description]
   * @param  {[type]} processMsg [description]
   * @param  {[type]} concurrent [description]
   * @return {[type]}            [description]
   */
  async listen(event, processMsg, concurrent = 1) {
    // if not connecet, defer the binding till it's connected
    if(!this._channel)
      this._deferredListener.push({ event, processMsg, concurrent });

    // when connected just bind things
    else
      this._listener(event, processMsg, concurrent);
  }


  /**
   * Publishes an event
   * @public
   */
  async publish(event, data, correlationId = uuid.v4()) {
    console.log(' [f] publishing %s %s', event, correlationId);

    // ensure topic exchange
    await this._channel.assertExchange('app', 'topic', { durable: false, alternateExchange: 'deadletter' });

    // pbulis the event and include the correlationId and the replyTo queue
    return new Promise((resolve, reject) => {
      let buffer = _convertToBuffer(data);
      this._callbacks[correlationId] = (value) => resolve(value);
      this._channel.publish('app', event, buffer, { correlationId, replyTo: this._callbackQueue.queue, type: event });
    });
  }

  /**
   * Binds the method to the event for handling
   * @private
   */
  async _handler(event, processMsg, concurrent) {
    console.log('Handling %s', event);

    await this._channel.assertExchange('app', 'topic', { durable: false, alternateExchange: 'deadletter' });
    await this._channel.assertQueue(event, { durable: false, autoDelete: true, deadLetterExchange: 'deadletter' });
    await this._channel.bindQueue(event, 'app', event);

    if(concurrent > 0)
      await this._channel.prefetch(concurrent);

    this._channel.consume(event, (msg) => this._handleMsg(event, msg, processMsg).catch(err => console.log(err.stack)));
  }

  /**
   * Binds the method to the event for listening
   * @private
   */
  async _listener(event, processMsg, concurrent) {
    console.log('Listening to %s', event);

    await this._channel.assertExchange('app', 'topic', { durable: false, alternateExchange: 'deadletter' });
    await this._channel.assertQueue(event, { durable: false, autoDelete: true, deadLetterExchange: 'deadletter' });
    await this._channel.bindQueue(event, 'app', event);

    if(concurrent > 0)
      await this._channel.prefetch(1);

    this._channel.consume(event, (msg) => this._listenMsg(event, msg, processMsg).catch(err => console.log(err.stack)));
  }

  /**
   * Handles an event
   * @private
   */
  async _handleMsg(event, msg, processMsg) {
    let correlationId = msg.properties.correlationId;
    let replyTo = msg.properties.replyTo;
    console.log(' [f] handing %s %s', event, correlationId);

    try {
      // creates a publish method that is bound the current correlationId
      let contextPublish = (event, data) => this.publish(event, data, correlationId);

      // calls the processMsg express with the message and passes in the
      // channel, event, and bound publish method
      let input = _convertFromBuffer(msg.content);
      let result = await processMsg(input, { ctx: this, event, publish: contextPublish });
      let buffer = _convertToBuffer(result);

      // if this was an rpc call, then we reply back directly to the originator
      if(replyTo)
        this._channel.sendToQueue(replyTo, buffer, { correlationId });

      // push the completion event back to the main queue
      this._channel.publish('app', event + '.complete', buffer, { correlationId });

      // ack the message to remove it
      this._channel.ack(msg);
    }
    catch(ex) {
      let buffer = await _convertToBuffer(ex.stack);

      // if this was an rpc call, then we reply back directly to the originator
      if(replyTo)
        this._channel.sendToQueue(replyTo, buffer, { correlationId });

      // push the error event back to the main queue
      this._channel.publish('app', event + '.error', buffer, { correlationId });

      // ack the message as complete
      this._channel.nack(msg, false, false);
    }
  }

  async _listenMsg(event, msg, processMsg) {
    let correlationId = msg.properties.correlationId;
    console.log(' [f] listened to %s %s', event, correlationId);

    try {
      // creates a publish method that is bound the current correlationId
      let contextPublish = (event, data) => this.publish(event, data, correlationId);

      // calls the processMsg express with the message and passes in the
      // channel, event, and bound publish method
      let input = _convertFromBuffer(msg.content);
      await processMsg(input, { ctx: this, event, publish: contextPublish });

      // ack the message so that prefetch works
      await this._channel.ack(msg);
    }
    catch(ex) {
      let buffer = await _convertToBuffer(ex.stack);
      this._channel.publish('app', event + '.error', buffer, { correlationId });

      // ack the message as complete
      this._channel.nack(msg, false, false);
    }
  }
}

function _convertToBuffer(result) {
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
  }

function _convertFromBuffer(buffer) {
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
}
