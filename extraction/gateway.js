
const BROKER_PATH = process.argv[2] || process.env.BROKER_PATH;
let framework = require('./app')();
let app = require('express')()

app.get('/file-bytes', (req, res, next) => fileBytes(req, res).catch(next));
app.get('/extract', (req, res, next) => extract(req, res).catch(next));
app.get('/concepts', (req, res, next) => concepts(req, res).catch(next));
app.get('/test', (req, res, next) => test(req, res).catch(next));

// start express
app.listen(5050, () => console.log('Listening on port 5050'));

// start the framework
framework.start(BROKER_PATH).catch(console.log);

// GET /file-bytes
async function fileBytes(req, res) {
  let path = req.query.path;
  if(!path) return res.status(400).send('path is required');

  let bytes = await framework.publish('file.bytes', path);
  res.send(bytes);
}

// GET /extract
async function extract(req, res) {
  let path = req.query.path;
  if(!path) return res.status(400).send('path is required');

  let result = await framework.publish('text.extract', path);
  res.set('content-type', 'text/plain').send(result);
}

// GET /concepts
async function concepts(req, res) {
  let path = req.query.path;
  if(!path) return res.status(400).send('path is required');

  let result = await framework.publish('concepts.extract', path);
  let buffer = new Buffer(result[0].data);
  let json = JSON.parse(buffer.toString());
  res.send(json);
}

async function test(req, res) {
  let path = req.query.path;
  if(!path) return res.status(400).send('path is required');

  let start = new Date();
  let files = await getFiles(path)
  let results = [];
  for(let file of files) {
    console.log(' [x] processing %s', file);
    results.push(framework.publish('concepts.extract', file));
  }
  for(let result of results) {
    await result;
  }

  let end = new Date();

  res.send({
    start: start,
    end: end
  });
}

async function getFiles(dirPath) {
  let fs = require('fs');
  let path = require('path');
  return new Promise((resolve, reject) => {
    fs.readdir(dirPath, (err, files) => {
      if(err) reject(err);
      else {
        let results = files.map(file => path.join(dirPath, file));
        resolve(results);
      }
    });
  });
}
