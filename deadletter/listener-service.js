
const BROKER_PATH = process.argv[2] || process.env.BROKER_PATH;
let framework = require('./app')({ name: 'echo' });

framework.start(BROKER_PATH).catch(console.log);
framework.listen('echo.complete', onEcho);

async function onEcho(data) {
  console.log(' [x] saw echo %s', data);
}