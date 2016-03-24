
let amqp = require('amqplib');
let BROKER_PATH = process.argv[2] || process.env.BROKER_PATH;

async function start() {
  let connection = await amqp.connect(BROKER_PATH);
  let channel = await connection.createChannel();
  console.log(`Connected to RabbitMQ at ${BROKER_PATH}`);

  await channel.assertExchange('ex-collab', 'fanout');
  await channel.assertExchange('ex-index-service', 'topic');
  await channel.bindExchange('ex-index-service', 'ex-collab', '');
  await channel.assertQueue('q-index-service', { durable: true });
  await channel.bindQueue('q-index-service', 'ex-index-service', 'text.contents');

  channel.consume('q-index-service', (msg) => handle(channel, msg).catch(console.log));
}

start().catch(console.log);

async function handle(channel, msg) {
  let content = msg.content.toString();
  console.log(' [x] received ' + content);
  channel.publish('ex-collab', 'index.complete', new Buffer('Simulated index of ' + content));
  channel.ack(msg);
}
