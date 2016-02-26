
const BROKER_PATH = process.env.BROKER_PATH;
const TIKA_PATH = process.env.TIKA_PATH || 'http://localhost';

let fs = require('fs');
let path = require('path');
let uuid = require('node-uuid');
let request = require('request');
let framework = require('./app')({ name: 'text' });

framework.start(BROKER_PATH).catch(console.log);
framework.on('text.extract', extractText);

async function extractText(path, { publish }) {
  let byteString = await publish('file.bytes', path);
  let result = await callTika(byteString);
  return result;
}


// HELPERS

async function bufferToStream(buffer) {
  let stream = new require('stream').Duplex();
  stream.push(buffer);
  stream.push(null);
  return stream;
}

async function callTika(byteString) {
  let byteStream = await bufferToStream(byteString);
  return new Promise((resolve, reject) => {
    byteStream
      .pipe(request.put(TIKA_PATH + ':9998/tika', (err, response, body) => {
        if(err) reject(err);
        else resolve(body);
      }))
  });
}