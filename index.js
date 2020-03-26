const net = require('net');

const socket = new net.Socket();


const handleClose = () => {
  console.log('close');
  console.log('++++++', socket.connecting);
};

socket.on('connect', () => {
  console.log('connect');
  setTimeout(() => {
    socket.destroy();
    socket.off('close', handleClose);
  }, 1000);
});

socket.on('close', handleClose);

setTimeout(() => {
  console.log(socket.connecting);
  socket.destroy();
}, 3000);

socket.connect({
  host: 'localhost',
  port: 4003,
});
