
const BROKER_PATH = process.argv[2] || process.env.BROKER_PATH;

let fs = require('fs');
let http = require('http');
let https = require('https');
let framework = require('./app')({ name: 'file' });

framework.start(BROKER_PATH).catch(console.log);
framework.on('file.bytes', fileBytes);

// HELPERS

async function fileBytes(path) {
  if(!path) throw new Error('Path is required');

  if(path.startsWith('http') || path.startsWith('https'))
    return await getUrl(path);
  else
    return await getFile(path);
}

async function getFile(path) {
  console.log(' [x] file read of %s', path);
  let contentType = await getContentType(path);
  return new Promise((resolve, reject) => {
    fs.readFile(path, (err, buffer) => {
      if (err) reject(err);
      else {
        let result = {
          contentType: contentType,
          body: buffer.toString('base64')
        };
        console.log(' [x] %d %s', buffer.length, contentType);
        resolve(result);
      }
    });
  });
}

async function getUrl(path) {
  return new Promise((resolve, reject) => {
    let agent = path.startsWith('https') ? https : http;
    agent.get(path, (res) => {
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
        resolve(result);
      })
    }).on('error', reject);
  });
}

async function getContentType(path) {
  let parts = path.split('.');
  let ext = parts[parts.length - 1].toLowerCase();
  console.log(' [x] extension %s', ext);
  switch(ext) {
    case 'mht': return 'message/rfc822';
    case 'pdf': return 'application/pdf';
    case 'dat': return 'application/octet-stream';
    case 'dbf': return 'application/octet-stream';
    case 'doc': return 'application/msword';
    case 'xls': return 'application/vnd.ms-excel';
    case 'rtf': return 'application/rtf';
    case 'gif': return 'image/gif';
    case 'txt': return 'text/plain';
    default: return 'text/plain';
  }
}