
let amqp = require('amqplib');
let BROKER_PATH = process.argv[2] || process.env.BROKER_PATH;

let connection;
let channel;

let express = require('express');
let app = express();

app.get('/', (req, res, next) => apiEndpoint(req, res).catch(next));
app.listen(5050, () => console.log('Express listening on port 5050'));

async function apiEndpoint(req, res) {
  let file = req.query.file;
  if(!file) {
    return res.status(400).send('file is required');
  }

  await channel.assertExchange('ex-collab', 'fanout', { durable: true });
  await channel.publish('ex-collab', 'concepts.extract', new Buffer(JSON.stringify({ file: file })));

  res.send('publish complete');
}



async function start() {
  connection = await amqp.connect(BROKER_PATH);
  channel = await connection.createChannel();
  console.log(`Connected to RabbitMQ at ${BROKER_PATH}`);
}
start().catch(console.log);