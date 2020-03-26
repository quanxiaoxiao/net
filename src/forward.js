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
  const state = {
    isClose: false,
    isCloseConnect: false,
    isCleanup: false,
  };
  let connection;

  socket.once('error', handleError);
  socket.once('close', handleClose);
  socket.once('end', handleEnd);

  if (!state.writable || state.isClose) {
    return;
  }
  const sourceHostname = `${socket.remoteAddress}:${socket.remotePort}`;
  const destHostname = `${hostname}:${port}`;
  const start = new Date();

  logger.info(`${sourceHostname} ----- ${destHostname} ${start.getTime()}`);

  connection = connector({ // eslint-disable-line
    hostname,
    port,
    bufList,
  }, {
    onData: (chunk) => {
      if (state.isClose) {
        logger.error(`${destHostname} -> ${sourceHostname} EPIPE`);
        state.isCloseConnect = true;
        connection();
      } else if (socket.writable) {
        const ret = socket.write(incoming(chunk));
        if (!ret) {
          connection.pause();
        }
      }
    },
    onConnect: () => {
      if (state.isClose) {
        state.isCloseConnect = true;
        connection();
      } else {
        logger.info(`${sourceHostname} -> ${destHostname} ${Date.now() - start.getTime()}ms`);
      }
    },
    onError: (error) => {
      state.isCloseConnect = true;
      logger.error(`${destHostname} x-> ${error.message}`);
      if (!state.destroyed) {
        socket.destroy();
      }
    },
    onEnd: () => {
      logger.info(`${destHostname} x-> ${sourceHostname}`);
      state.isCloseConnect = true;
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

  function handleError(error) {
    logger.error(`${sourceHostname} ${error.message}`);
    state.isClose = true;
    if (connection && !state.isCloseConnect) {
      state.isCloseConnect = true;
      connection();
    }
    cleanup();
  }

  function handleClose(hasError) {
    state.isClose = true;
    cleanup();
    if (!connection || state.isCloseConnect) {
      return;
    }
    if (hasError) {
      logger.error(`${sourceHostname} x-> ${destHostname}`);
      if (!state.isCloseConnect) {
        state.isCloseConnect = true;
        connection();
      }
    } else {
      logger.info(`${sourceHostname} x-> ${sourceHostname}`);
      if (!state.isCloseConnect) {
        state.isCloseConnect = true;
        connection.end();
      }
    }
  }

  function handleEnd() {
    state.isClose = true;
    cleanup();
    if (!connection || state.isCloseConnect) {
      return;
    }
    logger.info(`${sourceHostname} x-> ${destHostname}`);
    if (!state.isCloseConnect) {
      state.isCloseConnect = true;
      connection.end();
    }
  }

  const handleData = (chunk) => {
    try {
      const ret = connection.write(outgoing(chunk));
      if (!ret) {
        socket.pause();
      }
    } catch (error) {
      state.isCloseConnect = true;
      logger.error(`${error.message}`);
      socket.destroy();
    }
  };

  const handleDrain = () => {
    connection.resume();
  };

  socket.on('drain', handleDrain);
  socket.on('data', handleData);

  function cleanup() {
    if (!state.isCleanup) {
      state.isCleanup = true;
      socket.off('data', handleData);
      socket.off('drain', handleDrain);
      socket.off('close', handleClose);
      socket.off('end', handleEnd);
      socket.off('error', handleError);
    }
  }
};

module.exports = forward;
