/* eslint no-use-before-define: 0 */
const connector = require('./connector');

const forward = (socket, {
  hostname,
  port,
  incoming,
  outgoing,
  bufList,
  logger,
  timeout,
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
    printError('socket had destroyed');
    return;
  }
  const state = {
    isActive: true,
    isCleanup: false,
    isConnect: false,
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
    printError('socket had closed');
    return;
  }
  const start = new Date();

  print(`${sourceHostname} ----- ${destHostname} ${start.getTime()}`);

  connection = connector({ // eslint-disable-line
    hostname,
    port,
    bufList,
    timeout,
  }, {
    onConnect: () => {
      if (!state.isActive) {
        connection();
      } else {
        print(`${sourceHostname} -> ${destHostname} ${Date.now() - start.getTime()}ms`);
        state.isConnect = true;
        process.nextTick(() => {
          if (state.isActive) {
            connection.resume();
            socket.resume();
          }
        });
      }
    },
    onData: (chunk) => {
      if (!state.isActive) {
        printError(`${destHostname} -> ${sourceHostname} EPIPE`);
        connection();
      } else {
        const ret = socket.write(incoming ? incoming(chunk) : chunk);
        if (!ret) {
          connection.pause();
        }
      }
    },
    onError: (error) => {
      printError(`${destHostname} x-> ${error.message}`);
      if (state.isActive) {
        socket.destroy();
      }
    },
    onEnd: () => {
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
    if (state.isActive) {
      state.isActive = false;
      printError(`${sourceHostname} ${error.message}`);
      cleanup();
      if (connection) {
        connection();
      }
    }
  }

  function handleClose(hasError) {
    if (state.isActive) {
      state.isActive = false;
      cleanup();
      if (connection) {
        printError(`${sourceHostname} x-> ${destHostname}`);
        if (hasError) {
          connection();
        } else {
          connection.end();
        }
      }
    }
  }

  function handleEnd() {
    if (state.isActive) {
      state.isActive = false;
      cleanup();
      if (connection) {
        print(`${sourceHostname} x-> ${destHostname}`);
        connection.end();
      }
    }
  }

  function handleTimeout() {
    if (state.isActive) {
      socket.end();
    }
  }

  function handleDataOnOutgoing(chunk) {
    if (!state.isActive) {
      socket.off('data', handleDataOnOutgoing);
      if (!socket.destroyed) {
        socket.destroy();
      }
    } else {
      try {
        const ret = connection.write(outgoing ? outgoing(chunk) : chunk);
        if (!ret && !socket.isPaused()) {
          socket.pause();
        }
      } catch (error) {
        printError(error.message);
        socket.destroy();
      }
    }
  }

  function handleDrain() {
    connection.resume();
  }

  socket.on('drain', handleDrain);
  socket.on('data', handleDataOnOutgoing);
  if (timeout != null) {
    socket.on('timeout', handleTimeout);
  }

  function cleanup() {
    if (!state.isCleanup) {
      state.isCleanup = true;
      socket.off('data', handleDataOnOutgoing);
      socket.off('drain', handleDrain);
      socket.off('close', handleClose);
      socket.off('end', handleEnd);
      if (timeout != null) {
        socket.off('timeout', handleTimeout);
      }
    }
  }
};

module.exports = forward;
