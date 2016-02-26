
const BROKER_PATH = process.env.BROKER_PATH;

let fs = require('fs');
let request = require('request');
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
    request.get(path, (err, response, body) => {
      if(err) reject(err);
      else resolve(body);
    })
  });
}