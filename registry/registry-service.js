let express = require('express');
let plugin = require('./registry');
let app = express();

module.exports = app;


app.get('/registry/register', call(register));
app.get('/registry/locate', call(locate));
app.listen(8000, () => console.log('Listening on 8000'));

function call(method) {
  return (req, res, next) => method(req, res, next).catch((err) => {
    console.log(err.stack);
    next(err);
  });
}

function getMessage(req) {
  return Object.assign({}, req.params, req.query, req.body);
}

async function register(req, res) {
  let msg = getMessage(req);
  let result = await plugin.register(msg);
  res.send(result);
}

async function locate(req, res) {
  let msg = getMessage(req);
  let result = await plugin.locate(msg);
  res.send(result);
}
