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
    isConnectorClose: false,
    isCleanup: false,
  };
  let connection;

  const sourceHostname = `${socket.remoteAddress}:${socket.remotePort}`;
  const destHostname = `${hostname}:${port}`;

  socket.once('error', handleError);
  socket.once('close', handleClose);
  socket.once('end', handleEnd);
  if (!socket.writable || state.isClose) {
    if (!state.isCleanup) {
      state.isCleanup = true;
      socket.off('error', handleError);
      socket.off('close', handleClose);
      socket.off('end', handleEnd);
    }
    return;
  }
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
        state.isConnectorClose = true;
        connection();
      } else if (socket.writable) {
        const ret = socket.write(incoming ? incoming(chunk) : chunk);
        if (!ret) {
          connection.pause();
        }
      }
    },
    onConnect: () => {
      if (state.isClose) {
        state.isConnectorClose = true;
        connection();
      } else {
        logger.info(`${sourceHostname} -> ${destHostname} ${Date.now() - start.getTime()}ms`);
      }
    },
    onError: (error) => {
      state.isConnectorClose = true;
      logger.error(`${destHostname} x-> ${error.message}`);
      if (!socket.destroyed) {
        socket.destroy();
      }
    },
    onEnd: () => {
      state.isConnectorClose = true;
      logger.info(`${destHostname} x-> ${sourceHostname}`);
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
    if (connection && !state.isConnectorClose) {
      state.isConnectorClose = true;
      connection();
    }
    cleanup();
  }

  function handleClose(hasError) {
    state.isClose = true;
    cleanup();
    if (!connection || state.isConnectorClose) {
      return;
    }
    if (hasError) {
      logger.error(`${sourceHostname} x-> ${destHostname}`);
      if (!state.isConnectorClose) {
        state.isConnectorClose = true;
        connection();
      }
    } else {
      logger.info(`${sourceHostname} x-> ${sourceHostname}`);
      if (!state.isConnectorClose) {
        state.isConnectorClose = true;
        connection.end();
      }
    }
  }

  function handleEnd() {
    state.isClose = true;
    cleanup();
    if (!connection || state.isConnectorClose) {
      return;
    }
    logger.info(`${sourceHostname} x-> ${destHostname}`);
    if (!state.isConnectorClose) {
      state.isConnectorClose = true;
      connection.end();
    }
  }

  function handleData(chunk) {
    if (!state.isConnectorClose) {
      try {
        const ret = connection.write(outgoing ? outgoing(chunk) : chunk);
        if (!ret) {
          socket.pause();
        }
      } catch (error) {
        state.isConnectorClose = true;
        logger.error(`${error.message}`);
        socket.destroy();
      }
    } else {
      socket.destroy();
    }
  }

  function handleDrain() {
    connection.resume();
  }

  socket.on('drain', handleDrain);
  socket.on('data', handleData);

  function cleanup() {
    if (!state.isCleanup) {
      state.isCleanup = true;
      socket.off('data', handleData);
      socket.off('drain', handleDrain);
      socket.off('close', handleClose);
      socket.off('end', handleEnd);
    }
  }
};

module.exports = forward;
