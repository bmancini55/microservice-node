
const BROKER_PATH = process.env.BROKER_PATH;

let framework = require('./app')({ name: 'text' });

framework.start(BROKER_PATH).catch(console.log);

framework.on('text.extract', async (msg, { publish }) => {
  // process me
  // result += await getResult(data);
  // return result;
});

// HELPERS