
const BROKER_PATH = process.argv[2] || process.env.BROKER_PATH;
let framework = require('./app')();
let app = require('express')()

app.get('/', (req, res, next) => test(req, res).catch(next));

// start express
app.listen(5050, () => console.log('Listening on port 5050'));

// start the framework
framework.start(BROKER_PATH).catch(console.log);

// GET /
async function test(req, res) {
  let event = req.query.event;
  let data = req.query.data || 'Hello World';
  if(!event)
    return res.status(400).send('event is required');

  let result = await framework.publish(event, data);
  res.send(result);
}