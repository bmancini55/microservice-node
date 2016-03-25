
import Framework from './framework';

(async () => {
  const BROKER_PATH = process.env.BROKER_PATH;

  const test = new Framework({ name: 'test' });
  await test.start(BROKER_PATH)

  // We'll make this service listens to echo events
  await test.respond('echo', async (msg) => {
    console.log('responding with ' + msg);
    await test.emit('echo.complete', 'Successfully completed ' + msg);
    return msg;
  });

  await test.on('echo.complete', (msg) => {
    console.log('listened to ' + msg);
  })

  // We'll also request the echo event a few times and wait for the response
  for(let i = 0; i < 3; i++) {
    let result = await test.request('echo', 'hello ' + i);
    console.log('received ' + result);
  }

  test.stop();

})().catch(e => console.log(e.stack));
