
import Framework from './framework';
import fs from 'fs';

(async () => {
  const RABBIT = process.env.RABBIT;
  const REDIS = process.env.REDIS;
  const HTTPHOST = process.env.HTTPHOST;
  const HTTPPORT = process.env.HTTPPORT;

  const service = new Framework({ name: 'test' });
  await service.start({ brokerPath: RABBIT, redisUrl: REDIS, httpHost: HTTPHOST, httpPort: HTTPPORT });


  // this service listens for file.uploaded events and will
  // store a copy of the file information and then emit
  // a 'file.available' event that other services will listen for
  service.on('file.uploaded', async ({ name, data }, { emit }) => {
    await writeFileAsync(`/tmp/${name}`, data);
    await emit('file.available', { name, data });
  });

})().catch(e => console.log(e.stack));



/**
 * @private
 * Writes the file to the system
 * @param  {[type]} path     [description]
 * @param  {[type]} contents [description]
 * @return {[type]}          [description]
 */
async function writeFileAsync(path, contents) {
  return new Promise((resolve, reject) => {
    fs.writeFile(path, contents, (err) => {
      if(err) reject(err);
      else    resolve();
    });
  });
}
