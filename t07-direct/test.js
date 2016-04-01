
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

  // listen for file available events that will contain the
  // actual file contents that were submitted by the file service
  await test.on('file.available', (data) => {
    console.log(data);
  });

  // Emit a file.uploaded event that the file service will listen to
  // and persist the file bits
  await test.emit('file.uploaded', { name: 'test.txt', data: 'This is test data' });


})().catch(e => console.log(e.stack));
