
const BROKER_PATH = process.argv[2] || process.env.BROKER_PATH;

let fs = require('fs');
let bluebird = require('bluebird');
let path = require('path');
let spawn = require('child_process').spawn;
let uuid = require('node-uuid');

bluebird.promisifyAll(fs);

let framework = require('./app')({ name: 'concepts' });

framework.start(BROKER_PATH).catch(console.log);
framework.on('concepts.extract', handleExtractConcepts);

async function handleExtractConcepts(path, { publish }) {
  let text = await publish('text.extract', path);
  return await extractConcepts(text);
}

async function extractConcepts(text) {
  const guid = uuid.v4();
  const inputPath = `/tmp/${guid}.in`;
  const outputPrefix = `/tmp/${guid}`;

  // create the text input
  await createInput(inputPath, text);

  // spawn the new process
  return new Promise((resolve, reject) => {
    const cmd = '/usr/local/basis/rlp/bin/amd64-glibc25-gcc42/test';
    const args = [ '/usr/local/basis', inputPath, 'bl', outputPrefix ];

    let outBuffers = [];
    let errBuffers = [];
    let basis = spawn(cmd, args);
    basis.stdout.on('data', console.log);
    basis.stderr.on('data', console.error);
    basis.on('close', () => onClose(guid).then(resolve).catch(console.log));
  });
}

// HELPERS

async function onClose(guid) {
  let outputs = await readOutputs('/tmp', guid);
  await deleteOutputs('/tmp', guid);
  return outputs;
}

async function createInput(inputPath, text) {
  await fs.writeFileAsync(inputPath, text);
}

async function deleteOutputs(dir, guid) {
  let files = await fs.readdirAsync(dir);
  for(let file of files) {
    if(file.indexOf(guid) >= 0) {
      await fs.unlinkAsync(path.join(dir, file));
    }
  }
}

async function readOutputs(dir, guid) {
  let results = [];
  let files = await fs.readdirAsync(dir);
  for(let file of files) {
    if(file.indexOf(guid) >= 0) {
      results.push(await fs.readFileAsync(path.join(dir, file)));
    }
  }
  return results;
}