let store = {};

module.exports = {
  register,
  locate
};

async function register(msg) {
  let {host} = msg;
  let {port} = msg;
  let {pin} = msg;
  let pins = store[pin] || [];
  pins.push({ host, port });
  store[pin] = pins;
  return { host, port, pin };
}

async function locate(msg) {
  let {pin} = msg;
  let hosts = store[pin];
  if(hosts) {
    let index = Math.floor(Math.random() * hosts.length);
    return hosts[index];
  }
  else
    return null;
}
