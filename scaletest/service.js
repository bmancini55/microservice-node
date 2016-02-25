
const BROKER_PATH = process.env.BROKER_PATH;
const SERVICE_NAME = process.env.SERVICE_NAME;

let framework = new (require('./app'))({ name: SERVICE_NAME });

framework.on(SERVICE_NAME + '.read', async (msg) => {
  let delayedValue = new Promise((resolve) => {
    let data = msg.content.toString();
    let delay = Math.floor(Math.random() * 100) + 1
    setTimeout(() => resolve(data + ' DONE!'), delay);
    console.log(' [s] delay %d for \'%s\'', delay, data);
  });

  let result = await delayedValue;
  return result;
});

framework.start(BROKER_PATH).catch(console.log);