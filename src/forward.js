/* eslint no-use-before-define: 0 */
const connector = require('./connector');

const forward = (socket, {
  hostname,
  port,
  incoming,
  outgoing,
  bufList,
  logger,
}) => {
  const printError = (...args) => {
    if (logger && logger.error) {
      logger.error(...args);
    }
  };

  const print = (...args) => {
    if (logger && logger.info) {
      logger.info(...args);
    }
  };
  if (socket.destroyed) {
    return;
  }
  const state = {
    isActive: true,
    isConnectorClose: false,
    isCleanup: false,
    paused: false,
  };
  let connection;

  const sourceHostname = `${socket.remoteAddress}:${socket.remotePort}`;
  const destHostname = `${hostname}:${port}`;

  socket.once('error', handleError);
  socket.once('close', handleClose);
  socket.once('end', handleEnd);
  if (!socket.writable || !state.isActive) {
    if (!state.isCleanup) {
      state.isCleanup = true;
      socket.off('error', handleError);
      socket.off('close', handleClose);
      socket.off('end', handleEnd);
    }
    return;
  }
  const start = new Date();

  print(`${sourceHostname} ----- ${destHostname} ${start.getTime()}`);

  connection = connector({ // eslint-disable-line
    hostname,
    port,
    bufList,
  }, {
    onData: (chunk) => {
      if (!state.isActive) {
        printError(`${destHostname} -> ${sourceHostname} EPIPE`);
        state.isConnectorClose = true;
        connection();
      } else {
        const ret = socket.write(incoming ? incoming(chunk) : chunk);
        if (!ret) {
          connection.pause();
        }
      }
    },
    onConnect: () => {
      if (!state.isActive) {
        state.isConnectorClose = true;
        connection();
      } else {
        print(`${sourceHostname} -> ${destHostname} ${Date.now() - start.getTime()}ms`);
      }
    },
    onError: (error) => {
      state.isConnectorClose = true;
      printError(`${destHostname} x-> ${error.message}`);
      if (!socket.destroyed) {
        socket.destroy();
      }
    },
    onEnd: () => {
      state.isConnectorClose = true;
      print(`${destHostname} x-> ${sourceHostname}`);
      if (state.isActive) {
        socket.end();
      }
    },
    onDrain: () => {
      if (socket.readable && socket.isPaused()) {
        socket.resume();
      }
    },
  });

  function handleError(error) {
    printError(`${sourceHostname} ${error.message}`);
    state.isActive = false;
    if (connection && !state.isConnectorClose) {
      state.isConnectorClose = true;
      connection();
    }
    cleanup();
  }

  function handleClose(hasError) {
    state.isActive = false;
    cleanup();
    if (!connection || state.isConnectorClose) {
      return;
    }
    if (hasError) {
      printError(`${sourceHostname} x-> ${destHostname}`);
      if (!state.isConnectorClose) {
        state.isConnectorClose = true;
        connection();
      }
    } else {
      print(`${sourceHostname} x-> ${sourceHostname}`);
      if (!state.isConnectorClose) {
        state.isConnectorClose = true;
        connection.end();
      }
    }
  }

  function handleEnd() {
    state.isActive = false;
    cleanup();
    if (!connection || state.isConnectorClose) {
      return;
    }
    print(`${sourceHostname} x-> ${destHostname}`);
    if (!state.isConnectorClose) {
      state.isConnectorClose = true;
      connection.end();
    }
  }

  function handleData(chunk) {
    if (!state.isConnectorClose) {
      try {
        const ret = connection.write(outgoing ? outgoing(chunk) : chunk);
        if (!ret && socket.readable) {
          socket.pause();
        }
      } catch (error) {
        state.isConnectorClose = true;
        printError(`${error.message}`);
        if (!socket.destroyed) {
          socket.destroy();
        }
      }
    } else if (!socket.destroyed) {
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
