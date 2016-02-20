/**
 * This represents an API Gateway where REST is used to interact with the system.
 * To me, solving this interaction piece is important since it dictates how
 * an existing monolith would interact with an event-based system.
 */

let express = require('express');
let amqp = require('amqplib');
let uuid = require('node-uuid');

let brokerPath = process.env.BROKER_PATH || 'amqp://192.168.99.100';

/**
 * This code contains some boilerplate that can be abstracted into an Application object
 * where mounts are attached, similar to Express.
 *
 * For now, it contains all of the setup logic to bootstrap the service.
 */
async function start() {
  let broker = await amqp.connect(brokerPath);
  let channel = await broker.createChannel();
  console.log('Connected to RabbitMQ');

  // asserts that the following queues are available
  await channel.assertQueue('file.read', { durable: true });
  await channel.assertQueue('file.read.complete', { durable: false });

  // bootstrap the express application
  let app = express();
  app.get('/file', (req, res, next) => getFile(req, res).catch(next));


  /**
   * Express mount method implemented with async/await.
   * It is mounted to /file and requires a 'fileId' querystring property.
   */
  async function getFile(req, res, next) {
    let fileId = req.query.fileId;
    console.log('Requesting %s', fileId);

    if(!fileId)
      res.status(400).send('fileId is required');

    let result = await publish('file.read', fileId);
    res.send(result);
  }

  // start the express application
  app.listen(5050, () => console.log('Express running on 5050'));


  // internel property on the application object for storing the
  // correlationId:callback back... explained below
  let callbacks = {}

  /**
   * Framework method for publishing data into a queue.  This method does a few things
   * that will be managed by the farmework:
   *
   * 1. Starts a consumer channel on the queue.name.complete queue that looks for
   *    correlationIds in the callback lookup. This is necessary because the consumer,
   *    once started will blindly listen for any messages in the completion queue
   *    and we wnat to filter to just the ones that match our correlationId... this
   *    may be an inefficiency (but was designed to allow pubsub) like behavior.
   *    We MAY be able to get around it by naming the callback event:
   *    queue.name.complete.correlationId so that this service can be directly bound
   *    to only handle messages it cares about.  I'm not sure if the binding/unbinding
   *    overhead would perform better though.  Something to test. I digress.
   *
   * 2. Starts a consumer channel on the queue.name.error queue that looks for failure
   *    that match our correlationId in the callback lookup.
   * 3. The data is emitted onto the queue with the new correlationId
   * 4. A new callback is added to the callback lookup with the correlation Id. This callback
   *    is a resolve
   *
   * This returns a promise.
   */
  function publish(queue, data) {
    // Consume on the completion queue and execute the corresponding
    // callback if it matches our correlationId.
    channel.consume(queue + '.complete', (msg) => {
      console.log('Received message %s', msg.properties.correlationId);
      let correlationId = msg.properties.correlationId;
      if(callbacks[correlationId]) {
        callbacks[correlationId](null, msg.content.toString());
      }
    }, { noAck: true });

    // Consome on the error queue and excute the corresponding
    // callback if it matches our correlationId.
    channel.consume(queue + '.error', (msg) => {
      console.log('Received error %s', msg.properties.correlationId);
      let correlationId = msg.properties.correlationId;
      if(callbacks[correlationId]) {
        callbacks[correlationId](msg.content.toString())
      }
    }, { noAck: true });

    // Return a promise that will resolve when the callback is executed. This
    // allows for usage of async/await by the consumer!
    return new Promise((resolve, reject) => {
      // create correlationId
      let correlationId = uuid.v4();

      // emit to queue. This will be converted to emit to the worker exchange
      // based on the proposed architecture.
      channel.sendToQueue(queue, new Buffer(data), { correlationId });

      // Create a callback lambda that resolves the current promise with the
      // results of the message!
      callbacks[correlationId] = (err, value) => {
        if(err) reject(err);
        else resolve(value);
      }
    });
  }
}

// Executes the start method and logs any exceptions. Similar to an Express app.listen(() => {});
start().catch(err => console.log(err.stack));

