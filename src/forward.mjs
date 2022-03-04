/* eslint no-use-before-define: 0 */
import connector from './connector.mjs';

export default (socket, {
  hostname,
  port,
  incoming,
  outgoing,
  bufList,
  timeout = 1000 * 30,
  logger,
}) => {
  const printError = (error) => {
    if (process.env.NODE_ENV === 'development') {
      console.error(error);
    }
    if (logger && logger.warn) {
      logger.warn(error);
    }
  };

  const print = (...args) => {
    if (logger && logger.info) {
      logger.info(...args);
    }
  };

  if (socket.destroyed || (!socket.writable && !socket.readable)) {
    printError('socket alread close');
    return;
  }

  const state = {
    isActive: true,
    isCleanup: false,
    isConnect: false,
  };

  let connection;

  const sourceHost = `${socket.remoteAddress}:${socket.remotePort}`;
  const destHost = `${hostname}:${port}`;

  function handleTimeout() {
    state.isActive = false;
    printError(`${sourceHost} timeout`);
    if (connection) {
      connection();
    }
    cleanup();
    if (!socket.destroyed) {
      socket.destroy();
    }
  }

  socket.once('error', handleError);
  socket.once('close', handleClose);
  socket.once('end', handleEnd);

  if ((!socket.writable && !socket.readable) || !state.isActive) {
    if (!state.isCleanup) {
      state.isCleanup = true;
      socket.off('error', handleError);
      socket.off('close', handleClose);
      socket.off('end', handleEnd);
    }
    printError('socket alread closed');
    return;
  }
  const start = new Date();

  if (!socket.isPaused()) {
    socket.pause();
  }

  print(`${sourceHost} ->- ${destHost}`);

  connection = connector({ // eslint-disable-line
    hostname,
    port,
    bufList,
  }, {
    onConnect: () => {
      if (!state.isActive) {
        connection();
      } else {
        print(`${sourceHost} -> ${destHost} ${Date.now() - start.getTime()}ms`);
        state.isConnect = true;
        socket.on('drain', handleDrain);
        socket.on('data', handleDataOnOutgoing);
        process.nextTick(() => {
          if (state.isActive) {
            connection.resume();
            if (socket.isPaused()) {
              socket.resume();
            }
          }
        });
      }
    },
    onData: (chunk) => {
      if (!state.isActive) {
        printError(`${destHost} -x- ${sourceHost} EPIPE`);
        connection();
      } else {
        const dataChunk = incoming ? incoming(chunk) : chunk;
        if (dataChunk == null) {
          state.isActive = false;
          connection();
          cleanup();
          if (!socket.destroyed) {
            socket.destroy();
          }
        } else if (dataChunk.length > 0) {
          const ret = socket.write(dataChunk);
          if (!ret) {
            connection.pause();
          }
        }
      }
    },
    onError: (error) => {
      printError(`${destHost} \`${error.message}\``);
      if (state.isActive) {
        state.isActive = false;
        cleanup();
        if (!socket.destroyed) {
          socket.destroy();
        }
      }
    },
    onEnd: () => {
      print(`${destHost} -x- ${sourceHost}`);
      if (state.isActive) {
        state.isActive = false;
        cleanup();
        if (state.isConnect) {
          socket.end();
        } else {
          socket.destroy();
        }
      }
    },
    onDrain: () => {
      if (socket.readable && socket.isPaused()) {
        socket.resume();
      }
    },
  });

  function handleError(error) {
    printError(error.message);
    if (state.isActive) {
      state.isActive = false;
      cleanup();
      if (connection) {
        connection();
      }
    }
  }

  function handleClose(hasError) {
    print(`${sourceHost} -x- ${destHost}`);
    if (state.isActive) {
      state.isActive = false;
      cleanup();
      if (connection) {
        if (hasError) {
          connection();
        } else {
          connection.end();
        }
      }
    }
  }

  function handleEnd() {
    print(`${sourceHost} -x- ${destHost}`);
    if (state.isActive) {
      state.isActive = false;
      cleanup();
      if (connection) {
        connection.end();
      }
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
        const dataChunk = outgoing ? outgoing(chunk) : chunk;
        if (dataChunk == null) {
          state.isActive = false;
          connection();
          cleanup();
          if (!socket.destroyed) {
            socket.destroy();
          }
        } else if (dataChunk.length > 0) {
          const ret = connection.write(dataChunk);
          if (!ret && !socket.isPaused()) {
            socket.pause();
          }
        }
      } catch (error) {
        state.isActive = false;
        printError(error.message);
        cleanup();
        if (!socket.destroyed) {
          socket.destroy();
        }
      }
    }
  }

  function handleDrain() {
    connection.resume();
  }

  if (timeout != null && timeout > 0) {
    socket.once('timeout', handleTimeout);
  }

  function cleanup() {
    if (!state.isCleanup) {
      state.isCleanup = true;
      if (state.isConnect) {
        socket.off('data', handleDataOnOutgoing);
        socket.off('drain', handleDrain);
      }
      socket.off('close', handleClose);
      socket.off('end', handleEnd);
      if (timeout != null) {
        socket.off('timeout', handleTimeout);
      }
    }
  }
};
