
import Debug from 'debug';
import Framework from './framework';
let output = Debug('framework:output');

(async () => {
  const RABBIT = process.argv[2] || process.env.RABBIT;
  const REDIS = process.argv[3] || process.env.REDIS;
  const HTTPHOST = process.argv[4] || process.env.HTTPHOST;
  const HTTPPORT = process.argv[5] || process.env.HTTPPORT;

  const test = new Framework({ name: 'test' });
  await test.start({ brokerPath: RABBIT, redisUrl: REDIS, httpHost: HTTPHOST, httpPort: HTTPPORT });

  await test.on('echo', (msg) => {
    output('RECEIVED %s', msg);
  });

  await test.emit('echo', 'test');

})().catch(e => console.log(e.stack));
