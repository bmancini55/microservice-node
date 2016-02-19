/**
 * This represents how a monolith would interact with the
 * the MS infrastructure. A request is made and events
 * are triggered that are aggregated by the aggregator
 */

let express = require('express');
let bodyParser = require('body-parser');

let amqp = require('amqplib');
let brokerPath = 'amqp://192.168.99.100';


async function start() {
  let broker = await amqp.connect(brokerPath);
  let channel = await broker.createChannel();
  console.log('Connected to RabbitMQ');

  // create a callback channel
  let replyToQueue = await channel.assertQueue('', {exclusive:true });
  let replyTo = replyToQueue.queue;

  // ensure interactive queues are alive
  await channel.assertQueue('extract.file', { durable: true });
  await channel.assertQueue('extract.status', { durable: false });

  let app = express();
  app.use(bodyParser.urlencoded({ extended: false }));
  app.post('/extract', (req, res, next) => extract(req, res).catch(next));
  app.get('/extract', (req, res, next) => extract(req, res).catch(next));
  app.get('/status', (req, res, next) => status(req, res).catch(next));
  app.listen(5050, () => console.log('Express running on 5050'));

  /**
   * Kick off an extraction operation for the file specified
   */
  async function extract(req, res, next) {
    let correlationId = generateUuid();
    let fileIds = req.body.fileIds || req.query.fileIds;
    for(let fileId of fileIds) {
      console.log('Sending file %s', fileId);
      await channel.sendToQueue('extract.file', new Buffer(fileId), { correlationId });
    }
    res.send({ status: 'ok' });
  }

  /**
   * Find out the status of the extraction operation
   */
  async function status(req, res, next) {
    let correlationId = generateUuid();
    let fileId = req.query.fileId;
    await channel.sendToQueue('extract.status', new Buffer(fileId), { correlationId, replyTo });
    await channel.consume(replyTo, (msg) => {
      if(msg.properties.correlationId === correlationId) {
        res.send(msg.content.toString());
      }
    }, {noAck: true});
  }
}

start().catch(err => console.log(err.stack));




function generateUuid() {
  return Math.random().toString() +
         Math.random().toString() +
         Math.random().toString();
}