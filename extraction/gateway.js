
const BROKER_PATH = process.env.BROKER_PATH;
let framework = require('./app')();
let app = require('express')()

app.get('/file-bytes', (req, res, next) => fileBytes(req, res).catch(next));

// start express
app.listen(5050, () => console.log('Listening on port 5050'));

// start the framework
framework.start(BROKER_PATH).catch(console.log);

// Implements GET /file-bytes
async function fileBytes(req, res) {
  let path = req.query.path;
  if(!path) return res.status(400).send('path is required');

  let bytes = await framework.publish('file.bytes', path);
  res.send(bytes);
}