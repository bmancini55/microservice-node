
const BROKER_PATH = process.argv[2] || process.env.BROKER_PATH;
const TIKA_PATH = process.argv[3] || process.env.TIKA_PATH;

let url = require('url');
let http = require('http');
let uuid = require('node-uuid');
let framework = require('./app')({ name: 'text' });

framework.start(BROKER_PATH).catch(console.log);
framework.on('text.extract', extractText);

async function extractText(path, { publish }) {
  let str = await publish('file.bytes', path);
  let file = JSON.parse(str);
  file.body = new Buffer(file.body, 'base64');
  let result = await callTika(file);
  return result;
}


// HELPERS

async function callTika(file) {
  return new Promise((resolve, reject) => {
    console.log(' [x] %d %s', file.body.length, file.contentType);
    let tikaPath = url.parse(TIKA_PATH);
    let req = http.request({
      hostname: tikaPath.hostname,
      port: 9998,
      path: '/tika',
      method: 'PUT',
      headers: {
        'Content-Type': file.contentType
      }
    }, (res) => {
      let buffers = [];
      res.on('data', (buffer) => buffers.push(buffer));
      res.on('end', () => {
        let result = Buffer.concat(buffers);
        resolve(result);
      });
    });
    req.on('error', reject);
    req.write(file.body);
    req.end();
    // request.put({
    //   url: TIKA_PATH + ':9998/tika',
    //   body: file.body,
    //   headers: {
    //     'Content-type': file.contentType
    //   }
    // }, (err, response, body) => {
    //   console.log(' [x] Status code %s', response.statusCode);
    //   if(err) reject(err);
    //   else {
    //     resolve(body);
    //   }
    // });
  });
}