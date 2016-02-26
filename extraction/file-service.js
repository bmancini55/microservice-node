
const BROKER_PATH = process.argv[2] || process.env.BROKER_PATH;

let fs = require('fs');
let http = require('http');
let framework = require('./app')({ name: 'file' });

framework.start(BROKER_PATH).catch(console.log);
framework.on('file.bytes', fileBytes);

// HELPERS

async function fileBytes(path) {
  if(!path) throw new Error('Path is required');
  let bytes = await getFile(path);
  return bytes;
}

function getFile(path) {
  return new Promise((resolve, reject) => {

    http.get(path, (res) => {
      let contentLength = res.headers['content-length'];
      let contentType = res.headers['content-type'];
      let buffers = []
      res.on('data', (chunk) => {
        buffers.push(chunk);
      });
      res.on('end', () => {
        let buffer = Buffer.concat(buffers);
        let result = {
          contentType: contentType,
          body: buffer.toString('base64')
        };
        console.log(' [x] %d %d %s', contentLength, buffer.length, contentType);
        resolve(JSON.stringify(result));
      })
    }).on('error', reject);


    // request.get(path, (err, response, body) => {
    //   if(err) reject(err);
    //   else {
    //     let result = {
    //       contentType: response.headers['content-type'],
    //       body: body
    //     };
    //     console.log(response.)
    //     console.log( '[x] %d', response.headers['content-length']);
    //     console.log(' [x] %d %s', result.body.length, result.contentType);
    //     result = JSON.stringify(result);
    //     resolve(result);
    //   }
    // })
  });
}