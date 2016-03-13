
const BROKER_PATH = process.argv[2] || process.env.BROKER_PATH;
let framework = require('./app')({ name: 'echo' });

framework.start(BROKER_PATH).catch(console.log);
framework.handle('echo', onEcho);

async function onEcho(data) {
  return data;
}
