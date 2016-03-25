import amqp from 'amqplib';
import uuid from 'node-uuid';
import Debug from 'debug';

const debug = Debug('framework')

const generateCorrelationId = () => uuid.v4();

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
}

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
}


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
    this._replyToQueue;
    this._deferredResponders = [];
    this._deferredListeners = [];
    debug('created service %s', name);
  }

  /**
   * Starts the service by connecting to the broker
   * binding the replyTo queue and attaching all listeners
   * @param  {[type]} brokerPath [description]
   * @return {[type]}            [description]
   */
  async start(brokerPath) {
    this._broker = await amqp.connect(brokerPath);
    this._channel = await this._broker.createChannel();
    debug('connected to %s', brokerPath);

    await this._createReplyQueue();
    await this._consumeReplyQueue();
    await this._attachDeferredResponders();
    await this._attachDeferredListeners();

    debug('service has successfully started');
  }

  /**
   * Stops the service
   * @return {[type]} [description]
   */
  async stop() {
    this._broker.close();
  }

  /**
   * Gets the connected channel
   * @return {[type]} [description]
   */
  getChannel() {
    if(!this._channel) {
      throw new Error('Execute start before attempting to use framework');
    }
    return this._channel;
  }

  /**
   * Requests data from another service and resolves the promise
   * when data is returned by the remote service.
   * @param  {[type]} event                 [description]
   * @param  {[type]} data                  [description]
   * @param  {[type]} options.correlationId [description]
   * @return {[type]}                       [description]
   */
  async request(event, data, { correlationId = uuid.v4()} = {}) {
    debug('requesting %s %s', event, correlationId);

    // ensure topic exchange
    await this.getChannel().assertExchange(this.appExchange, 'topic', { durable: false, alternateExchange: 'deadletter' });

    // publish the event and include the correlationId and the replyTo queue
    return new Promise((resolve) => {
      let buffer = convertToBuffer(data);
      this._callbacks[correlationId] = (msg) => resolve(msg);
      this.getChannel().publish(this.appExchange, event, buffer, { correlationId, replyTo: this._replyToQueue.queue });
    });
  }

  /**
   * Responds to a request for data by returning information.
   * @param  {[type]}   event    [description]
   * @param  {Function} callback [description]
   * @return {[type]}            [description]
   */
  async respond(event, processMsg, options) {
    // if not connected, defer the binding till it's connected
    if(!this._channel)
      this._deferredResponders.push({ event, processMsg, options });

    // when connected just bind things
    else
      await this._respond(event, processMsg, options);
  }

  /**
   * @private
   * @param  {[type]}   event              [description]
   * @param  {Function} callback           [description]
   * @param  {[type]}   options.concurrent [description]
   * @return {[type]}                      [description]
   */
  async _respond(event, processMsg, { concurrent = 0 } = {}) {
    const channel = this.getChannel();
    const appExchange = this.appExchange;

    await channel.assertExchange(appExchange, 'topic', { durable: false, alternateExchange: 'deadletter' });
    await channel.assertQueue(event, { durable: false, autoDelete: true, deadLetterExchange: 'deadletter' });
    await channel.bindQueue(event, appExchange, event);

    if(concurrent > 0)
      await channel.prefetch(concurrent);

    channel.consume(event, (msg) => this._respondToMsg(event, msg, processMsg).catch(err => console.log(err.stack)));
    debug('responds to %s', event);
  }

  /**
   * @private
   * @param  {[type]} event      [description]
   * @param  {[type]} msg        [description]
   * @param  {[type]} processMsg [description]
   * @return {[type]}            [description]
   */
  async _respondToMsg(event, msg, processMsg) {
    const correlationId = msg.properties.correlationId;
    const replyTo = msg.properties.replyTo;
    const channel = this.getChannel();
    debug('handing %s %s', event, correlationId);

    try {
      // calls the processMsg express with the message and passes in the
      // channel, event, and bound publish method
      const input = convertFromBuffer(msg.content);
      const result = await processMsg(input, { ctx: this, event });
      const buffer = convertToBuffer(result);

      // reply back
      channel.sendToQueue(replyTo, buffer, { correlationId });

      // ack the message to remove it from the queue
      channel.ack(msg);
    }
    catch(ex) {
      const buffer = await convertToBuffer(ex);

      // reply back with error
      channel.sendToQueue(replyTo, buffer, { correlationId });

      // ack the message as complete
      channel.nack(msg, false, false);
    }
  }

  /**
   * Listens for an event and does not respond with a value
   * @param  {[type]} event      [description]
   * @param  {[type]} processMsg [description]
   * @param  {[type]} concurrent [description]
   * @return {[type]}            [description]
   */
  async on(event, processMsg, options) {
    // if not connecet, defer the binding till it's connected
    if(!this._channel)
      this._deferredListeners.push({ event, processMsg, options });

    // when connected just bind things
    else
      await this._listen(event, processMsg, options);

  }


  /**
   * Binds the method to the event for listening
   * @private
   */
  async _listen(event, processMsg, { concurrent = 0 } = {}) {
    const channel = this.getChannel();
    const appExchange = this.appExchange;

    await channel.assertExchange(appExchange, 'topic', { durable: false, alternateExchange: 'deadletter' });
    await channel.assertQueue(event, { durable: false, autoDelete: true, deadLetterExchange: 'deadletter' });
    await channel.bindQueue(event, appExchange, event);

    if(concurrent > 0)
      await channel.prefetch(concurrent);

    channel.consume(event, (msg) => this._listenMsg(event, msg, processMsg).catch(err => console.log(err.stack)));
    debug('listens to %s', event);
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
    let channel = this.getChannel();
    debug('listened to %s %s', event, correlationId);

    try {
      // calls the processMsg express with the message and passes in the
      // channel, event, and bound publish method
      let input = convertFromBuffer(msg.content);
      await processMsg(input, { ctx: this, event });

      // ack the message so that prefetch works
      await channel.ack(msg);
    }
    catch(ex) {
      // ack the message as complete
      channel.nack(msg, false, false);
    }
  }


  /**
   * Emits a event
   * @param  {[type]} event   [description]
   * @param  {[type]} data    [description]
   * @param  {[type]} options [description]
   * @return {[type]}         [description]
   */
  async emit(event, data, { correlationId = uuid.v4() } = {}) {
    debug('emitting %s %s', event, correlationId);

    // ensure topic exchange
    await this.getChannel().assertExchange(this.appExchange, 'topic', { durable: false, alternateExchange: 'deadletter' });

    // emit event
    let buffer = convertToBuffer(data);
    this.getChannel().publish(this.appExchange, event, buffer, { correlationId });
  }


  /**
   * @private
   * @return {[type]} [description]
   */
  async _createReplyQueue() {
    let queue = await this.getChannel().assertQueue('', { exclusive: true });
    this._replyToQueue = queue;
    debug('created reply queue %s', queue.queue);
  }

  /**
   * @private
   * @return {[type]} [description]
   */
  async _consumeReplyQueue() {
    const handler = (msg) => {
      let correlationId = msg.properties.correlationId;
      debug('received response for %s', correlationId);

      if(this._callbacks[correlationId]) {
        let value = convertFromBuffer(msg.content);
        this._callbacks[correlationId](value);
      }
    }
    this.getChannel().consume(this._replyToQueue.queue, handler, { noAck: true });
  }

  /**
   * @private
   * @return {[type]} [description]
   */
  async _attachDeferredResponders() {
    for(let binding of this._deferredResponders) {
      await this._respond(binding.event, binding.processMsg, binding.options);
    }
  }

  async _attachDeferredListeners() {
    for(let binding of this._deferredListeners) {
      await this._listen(binding.event, binding.processMsg, binding.options);
    }
  }
}