
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
    this._deferredBindings = [];
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
        this._callbacks[correlationId](msg.content.toString());
      }
    }, { noAck: true });

    //
    for(let binding of this._deferredBindings) {
      this._on(binding.event, binding.processMsg);
    }

    console.log('Service has successfully started');
  }

  /**
   * Attaches an event listener to the event
   * @public
   */
  async on(event, processMsg) {
    // if not connecet, defer the binding till it's connected
    if(!this._channel)
      this._deferredBindings.push({ event, processMsg });

    // when connected just bind things
    else
      this._on(event, processMsg);
  }


  /**
   * Publishes an event
   * @public
   */
  async publish(event, data, correlationId = uuid.v4()) {
    console.log(' [f] publishing %s %s', event, correlationId);

    await this._channel.assertExchange('app', 'topic', { durable: true });
    await this._channel.assertExchange('complete', 'topic', { durable: false });
    await this._channel.assertExchange('error', 'topic', { durable: false });

    await this._channel.bindQueue(this._callbackQueue.queue, 'complete', event + '.complete.' + correlationId);
    await this._channel.bindQueue(this._callbackQueue.queue, 'error', event + '.error.' + correlationId);

    return new Promise((resolve, reject) => {
      this._callbacks[correlationId] = (value) => resolve(value);
      this._channel.publish('app', event, new Buffer(data), { correlationId });
    });
  }

  /**
   * Binds the method to the event
   * @private
   */
  async _on(event, processMsg) {
    console.log('Binding %s', event);

    await this._channel.assertExchange('app', 'topic', { durable: true });
    await this._channel.assertExchange('complete', 'topic', { durable: false });
    await this._channel.assertExchange('error', 'topic', { durable: false });

    await this._channel.assertQueue(event, { durable: true });
    await this._channel.bindQueue(event, 'app', event);

    this._channel.consume(event, (msg) => this._handle(event, msg, processMsg).catch(err => console.log(err.stack)));
  }

  /**
   * Handles an event
   * @private
   */
  async _handle(event, msg, processMsg) {
    let correlationId = msg.properties.correlationId;
    console.log(' [f] handing %s %s', event, correlationId);
    try {
      // creates a publish method that is bound the current correlationId
      let contextPublish = (event, data) => this.publish(event, data, correlationId);

      // calls the processMsg express with the message and passes in the
      // channel, event, and bound publish method
      let result = await processMsg(msg, { ctx: this, event, publish: contextPublish });

      // converts the results into a buffer
      let buffer = result;
      if(result !== undefined) {
        if(!(result instanceof Buffer)) {
          buffer = new Buffer(result);
        }
      }
      else {
        buffer = new Buffer('');
      }
      this._channel.publish('complete', event + '.complete.' + correlationId, buffer, { correlationId });
      this._channel.ack(msg);
    }
    catch(ex) {
      this._channel.publish('error', event + '.error.' + correlationId, new Buffer(ex.stack), { correlationId });
      this._channel.ack(msg);
    }
  }

}
