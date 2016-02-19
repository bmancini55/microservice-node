/**
 * This represents an extraction service that is scalable
 */

let fs = require('fs');
let path = require('path');
let bluebird = require('bluebird');
let amqplib = require('amqplib');
let brokerPath = 'amqp://192.168.99.100';

bluebird.promisifyAll(fs);

async function start() {
  let rabbit = await amqplib.connect(brokerPath);
  let channel = await rabbit.createChannel();

  // create listening queues
  await channel.assertQueue('file.read', { durable: true });
  await channel.assertQueue('file.read.complete', { durable: false });

  channel.consume('file.read', (msg) => handle('file.read', channel, msg, onFile));
}

start().catch(err => console.log(err.stack));


/**
 * Meta programming to auto ack requests
 */
async function handle(event, channel, msg, handler) {
  let result = await handler(channel, msg);
  if(result) {
    let correlationId = msg.properties.correlationId;
    let buffer = result;
    if(!result instanceof Buffer) {
      buffer = new Buffer(result);
    }
    channel.sendToQueue(event + '.complete', buffer, { correlationId });
    channel.ack(msg);
  }
}


/**
 * Send file bytes
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