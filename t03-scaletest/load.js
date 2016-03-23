
let http = require('http');
let host = process.argv[2]
let num = process.argv[3] || 1000;

console.log('Processing %d', num);
for(let i = 0; i < num; i ++) {
  http.get({ hostname: host, port: 5050, path: '/?event=a.read' }, (res) => {});
}
console.log('Sent all requests');
