/* eslint no-use-before-define: 0 */
const connector = require('./connector');

const forward = (socket, {
  hostname,
  port,
  incoming,
  outgoing,
  bufList,
  logger = {
    info: console.log,
    error: console.error,
  },
}) => {
  if (logger && logger.info) {
    logger.info(`${socket.remoteAddress} -> ${hostname}:${port}`);
  }
  const start = Date.now();
  const connection = connector({
    hostname,
    port,
    bufList: bufList.map((buf) => outgoing(buf)).filter((buf) => Buffer.isBuffer(buf)),
  }, {
    onData: (chunk) => {
      if (socket.writable) {
        const buf = incoming(chunk);
        if (typeof buf === 'function') {
          connection.write(buf(chunk));
        } else {
          const ret = socket.write(buf);
          if (!ret) {
            connection.pause();
          }
        }
      } else {
        connection();
      }
    },
    onConnect: () => {
      logger.info(`${socket.remoteAddress} -> ${hostname}:${port} ${Date.now() - start}ms`);
      while (bufList.length !== 0) {
        bufList.pop();
      }
    },
    onError: (error) => {
      logger.error(`${hostname}:${port} ${error.message}`);
      if (!socket.destroyed) {
        cleanup();
        socket.destroy();
      }
    },
    onEnd: () => {
      logger.info(`${hostname}:${port} x-> ${socket.remoteAddress}`);
      if (socket.writable) {
        socket.end();
      } else if (!socket.destroyed) {
        cleanup();
        socket.destroy();
      }
    },
    onDrain: () => {
      socket.resume();
    },
  });

  const handleError = (error) => {
    logger.error(`${socket.remoteAddress} ${error.message}`);
    connection();
    cleanup();
  };

  const handleClose = (hasError) => {
    if (hasError) {
      cleanup();
      connection();
    } else {
      connection.end();
    }
  };

  const handleEnd = () => {
    logger.info(`${socket.remoteAddress} x-> ${hostname}:${port}`);
    connection.end();
    cleanup();
  };

  const handleData = (chunk) => {
    const buf = outgoing(chunk);
    if (!buf) {
      socket.pause();
    } else {
      const ret = connection.write(buf);
      if (!ret) {
        socket.pause();
      }
    }
  };

  const handleDrain = () => {
    connection.resume();
  };

  socket.on('error', handleError);
  socket.once('close', handleClose);
  socket.once('end', handleEnd);
  socket.on('drain', handleDrain);
  socket.on('data', handleData);

  function cleanup() {
    socket.off('data', handleData);
    socket.off('drain', handleDrain);
    socket.off('close', handleClose);
    socket.off('end', handleEnd);
    socket.off('error', handleError);
  }
};

module.exports = forward;
