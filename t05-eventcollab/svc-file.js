
let amqp = require('amqplib');
let BROKER_PATH = process.argv[2] || process.env.BROKER_PATH;

async function start() {
  let connection = await amqp.connect(BROKER_PATH);
  let channel = await connection.createChannel();
  console.log(`Connected to RabbitMQ at ${BROKER_PATH}`);

  await channel.assertExchange('ex-collab', 'fanout');
  await channel.assertExchange('ex-file-service', 'topic');
  await channel.bindExchange('ex-file-service', 'ex-collab', '');
  await channel.assertQueue('q-file-service', { durable: true });
  await channel.bindQueue('q-file-service', 'ex-file-service', 'concepts.extract');

  channel.consume('q-file-service', (msg) => handle(channel, msg).catch(console.log));
}

start().catch(console.log);

async function handle(channel, msg) {
  let content = msg.content.toString();
  console.log(' [x] received ' + content);
  channel.publish('ex-collab', 'file.contents', new Buffer('Simulated file contents of ' + content));
  channel.ack(msg);
}

