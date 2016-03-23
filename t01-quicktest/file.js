/**
 * This represents a simple file service that listens for incoming
 * requests for files and responds with the file bytes. This service
 * is an example of a leaf-level service that other services will
 * rely on.
 */

let fs = require('fs');
let path = require('path');
let amqplib = require('amqplib');
let bluebird = require('bluebird');
bluebird.promisifyAll(fs);

let brokerPath = process.env.BROKER_PATH || 'amqp://192.168.99.100';


/**
 * This code contains some boilerplate that can be abstracted into an Application object
 * where mounts are attached, similar to Express.
 *
 * For now, it contains all of the setup logic to bootstrap the service.
 */
async function start() {
  let rabbit = await amqplib.connect(brokerPath);
  let channel = await rabbit.createChannel();
  console.log('Connected to RabbitMQ');

  // asserts that the following queues are available
  await channel.assertExchange('app', 'topic', { durable: true });
  await channel.assertQueue('file.read', { durable: true });
  await channel.bindQueue('file.read', 'app', 'file.read');

  //await channel.assertQueue('file.read', { durable: true });
  await channel.assertExchange('complete', 'topic', { durable: false });
  await channel.assertExchange('error', 'topic', { durable: false });

  // Begins consuming the queue using the "frameworks" handler method.
  // This will be converted into a middleware function so that multiple methods
  // can be bound to consumed messages.
  channel.consume('file.read', (msg) => handle('file.read', channel, msg, onFile).catch(err => console.log(err.stack)));
}

// Executes the start method and logs any exceptions. Similar to an Express app.listen(() => {});
start().catch(err => console.log(err.stack));


/**
 * Handler method for all inbound events that are being watched.  This method
 * is bound to a specific event signature and has a processing lambda that
 * can return a result.
 *
 * This method will auto-ack via a new event that appends '.complete'
 * to the event name.
 *
 * This method will auto-ack with an error that appends '.error'
 * to the event name if there is an error during processing.
 *
 * IF the processing lambda returns a result, that result is sent back as the ACK.
 * IF there is no result from the processing lambda, an empty object is returned.
 */
async function handle(event, channel, msg, processMsg) {
  let correlationId = msg.properties.correlationId;
  try {
    let result = await processMsg(channel, msg);
    let buffer = result;
    if(result) {
      if(!result instanceof Buffer) {
        buffer = new Buffer(result);
      }
    }
    else {
      buffer = new Buffer({});
    }
    channel.publish('complete', event + '.complete', buffer, { correlationId });
    channel.ack(msg);
  }
  catch(ex) {
    channel.publish('error', event + '.error', new Buffer(ex.stack), { correlationId });
    channel.ack(msg);
  }
}


/**
 * Finally an implemention of a mounted method.  This method is mounted to the 'file.read' event.
 * It's fairly simple, all it does it take the fileId as input and return the file bytes as a
 * return function.
 *
 * Ideally... this should be a pure function.  Some refactor may be done here so that the
 * "metadata" such as correlationId and channel are passed in as properties on arguments object.
 * This would allow destructuring operations to apply to the method arguments.
 */
async function onFile(channel, msg) {
  let correlationId = msg.properties.correlationId;
  let fileId = msg.content.toString();
  console.log('Recieved request %s: %s', correlationId, fileId);

  // this part could be put into a file system
  let filePath = path.resolve(fileId);
  let buffer = await fs.readFileAsync(filePath);

  console.log('Responding with %s', buffer.length);
  return buffer;
}