
const BROKER_PATH = process.env.BROKER_PATH;
const SERVICE_NAME = process.env.SERVICE_NAME;
const SERVICE_DEPS = process.env.SERVICE_DEPS || '';

let framework = new (require('./app'))({ name: SERVICE_NAME });

framework.on(SERVICE_NAME + '.read', async (msg, { publish }) => {
  let result = '';
  let data = msg.content.toString();

  // process each dependency
  let depEvents = getDepEvents();
  for(let depEvent of depEvents) {
    result += await publish(depEvent, data);
  }

  // process me
  result += await getResult(data);
  return result;
});

framework.start(BROKER_PATH).catch(console.log);


// HELPERS

function getDepEvents() {
  return SERVICE_DEPS.split(',').filter(p => p !== '').map(p => p.trim() + '.read');
}

function getResult(data) {
  return new Promise((resolve) => {
    let delay = Math.floor(Math.random() * 10) + 1
    setTimeout(() => resolve(SERVICE_NAME), delay);
  });
}