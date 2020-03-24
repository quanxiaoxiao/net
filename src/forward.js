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
  const sourceHostname = `${socket.remoteAddress}:${socket.remotePort}`;
  const destHostname = `${hostname}:${port}`;
  const start = new Date();
  logger.info(`${sourceHostname} ----- ${destHostname} ${start.getTime()}`);
  const connection = connector({
    hostname,
    port,
    bufList,
  }, {
    onData: (chunk) => {
      if (socket.writable) {
        const ret = socket.write(incoming(chunk));
        if (!ret) {
          connection.pause();
        }
      } else {
        logger.error(`->${sourceHostname} EPIPE`);
        cleanup();
        connection();
      }
    },
    onConnect: () => {
      logger.info(`${sourceHostname} -> ${destHostname} ${Date.now() - start.getTime()}ms`);
    },
    onError: (error) => {
      logger.error(`${destHostname} ${error.message}`);
      cleanup();
      socket.destroy();
    },
    onEnd: () => {
      logger.info(`${destHostname} x-> ${sourceHostname}`);
      cleanup();
      if (socket.writable) {
        socket.end();
      }
    },
    onDrain: () => {
      if (socket.readable) {
        socket.resume();
      }
    },
  });

  const handleError = (error) => {
    logger.error(`${sourceHostname} ${error.message}`);
    connection();
    cleanup();
  };

  const handleClose = (hasError) => {
    cleanup();
    if (hasError) {
      logger.error(`${sourceHostname} x-> ${destHostname} error close`);
      connection();
    } else {
      logger.info(`${sourceHostname} x-> ${sourceHostname}`);
      connection.end();
    }
  };

  const handleEnd = () => {
    logger.info(`${sourceHostname} x-> ${destHostname}`);
    cleanup();
    connection.end();
  };

  const handleData = (chunk) => {
    const ret = connection.write(outgoing(chunk));
    if (!ret) {
      socket.pause();
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
