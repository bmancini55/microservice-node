
let amqp = require('amqplib');
let uuid = require('node-uuid');

class App {

  /**
   * [constructor description]
   * @param  {[type]} name [description]
   * @return {[type]}      [description]
   */
  constructor({ name } = {}) {
    this.name = name;
    this.callbacks = {};
    this._deferredBindings = [];
  }

  /**
   * Starts listening to RabbitMQ and connects to the callback queue
   * and asserts that the main exchange is avaia
   */
  async start(brokerPath) {
    this.broker = await amqp.connect(brokerPath);
    this.channel = await this.broker.createChannel();
    console.log('Connected to %s', brokerPath);

    // Create the callback queue and start listening to it.
    // This will eventually get bound to topics that match correlationIds that the
    // current service listens to.
    this.callbackQueue = await this.channel.assertQueue('', { exclusive: true });
    this.channel.consume(this.callbackQueue.queue, (msg) => {
      let correlationId = msg.properties.correlationId;
      console.log(' [f] completed %s', correlationId);
      if(this.callbacks[correlationId]) {
        this.callbacks[correlationId](msg.content.toString());
      }
    }, { noAck: true });

    //
    for(let binding of this._deferredBindings) {
      this._on(binding.event, binding.processMsg);
    }
  }

  /**
   * [on description]
   */
  async on(event, processMsg) {
    // if not connecet, defer the binding till it's connected
    if(!this.channel)
      this._deferredBindings.push({ event, processMsg });

    // when connected just bind things
    else
      this._on(event, processMsg);
  }


  /**
   * [publish description]
   */
  async publish(event, data) {
    let correlationId = uuid.v4();

    await this.channel.assertExchange('app', 'topic', { durable: true });
    await this.channel.assertExchange('complete', 'topic', { durable: false });
    await this.channel.assertExchange('error', 'topic', { durable: false });

    await this.channel.bindQueue(this.callbackQueue.queue, 'complete', event + '.complete.' + correlationId);
    await this.channel.bindQueue(this.callbackQueue.queue, 'error', event + '.error.' + correlationId);

    return new Promise((resolve, reject) => {
      this.callbacks[correlationId] = (value) => resolve(value);
      this.channel.publish('app', event, new Buffer(data), { correlationId });
    });
  }

  /**
   * [_on description]
   */
  async _on(event, processMsg) {
    console.log('Binding %s', event);

    await this.channel.assertExchange('app', 'topic', { durable: true });
    await this.channel.assertExchange('complete', 'topic', { durable: false });
    await this.channel.assertExchange('error', 'topic', { durable: false });

    await this.channel.assertQueue(event, { durable: true });
    await this.channel.bindQueue(event, 'app', event);

    this.channel.consume(event, (msg) => this._handle(event, this.channel, msg, processMsg).catch(err => console.log(err.stack)));
  }

  /**
   * [_handle description]
   */
  async _handle(event, channel, msg, processMsg) {
    let correlationId = msg.properties.correlationId;
    console.log(' [f] handing %s %s', event, correlationId);
    try {
      let result = await processMsg(msg, { channel, event });
      let buffer = result;
      if(result !== undefined) {
        if(!(result instanceof Buffer)) {
          buffer = new Buffer(result);
        }
      }
      else {
        buffer = new Buffer('');
      }
      channel.publish('complete', event + '.complete.' + correlationId, buffer, { correlationId });
      channel.ack(msg);
    }
    catch(ex) {
      channel.publish('error', event + '.error.' + correlationId, new Buffer(ex.stack), { correlationId });
      channel.ack(msg);
    }
  }

}

module.exports = App;
