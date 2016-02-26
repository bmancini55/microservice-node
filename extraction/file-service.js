
const BROKER_PATH = process.env.BROKER_PATH;

let framework = require('./app')({ name: 'file' });

framework.start(BROKER_PATH).catch(console.log);

framework.on('file.bytes', async (msg, { publish }) => {
  // process me
  // result += await getResult(data);
  // return result;
});

// HELPERS