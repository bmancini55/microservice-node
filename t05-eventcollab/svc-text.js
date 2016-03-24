
let amqp = require('amqplib');
let BROKER_PATH = process.argv[2] || process.env.BROKER_PATH;

async function start() {
  let connection = await amqp.connect(BROKER_PATH);
  let channel = await connection.createChannel();
  console.log(`Connected to RabbitMQ at ${BROKER_PATH}`);

  await channel.assertExchange('ex-collab', 'fanout');
  await channel.assertExchange('ex-text-service', 'topic');
  await channel.bindExchange('ex-text-service', 'ex-collab', '');
  await channel.assertQueue('q-text-service', { durable: true });
  await channel.bindQueue('q-text-service', 'ex-text-service', 'file.contents');

  channel.consume('q-text-service', (msg) => handle(channel, msg).catch(console.log));
}

start().catch(console.log);

async function handle(channel, msg) {
  let content = msg.content.toString();
  console.log(' [x] received ' + content);
  channel.publish('ex-collab', 'text.contents', new Buffer('Simulated text contents of ' + content));
  channel.ack(msg);
}
