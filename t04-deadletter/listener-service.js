
const BROKER_PATH = process.argv[2] || process.env.BROKER_PATH;
let framework = require('./app')({ name: 'echo' });

framework.start(BROKER_PATH).catch(console.log);
framework.listen('echo', onEcho)
framework.listen('echo.complete', onEchoComplete);

async function onEcho(data) {
}

async function onEchoComplete(data) {
}