/* eslint no-use-before-define: 0 */

module.exports = (socket, {
  onData,
  onError,
  onEnd,
  onDrain,
}) => {
  if (socket.connecting || socket.pending) {
    socket.destroy();
    return null;
  }
  if (!socket.writable) {
    return null;
  }
  const state = {
    isEnd: false,
    isConnect: true,
    isClose: false,
    isEndEmit: false,
    isErrorEmit: false,
    isCleanup: false,
  };

  const bufList = [];
  const handleDrain = () => {
    if (state.isClose || state.isEnd || !state.isConnect) {
      if (!socket.destroyed) {
        socket.destroy();
      }
      return;
    }
    while (socket.bufferSize === 0
      && bufList.length > 0) {
      if (!state.isClose && !state.isEnd && state.isConnect && socket.writable) {
        const ret = socket.write(bufList.shift());
        if (!ret) {
          break;
        }
      } else {
        if (!socket.destroyed) {
          socket.destroy();
        }
        return;
      }
    }
    if (!state.isConnect) {
      if (!socket.destroyed) {
        socket.destroy();
      }
    } else if (socket.bufferSize === 0) {
      onDrain();
    }
  };
  const handleData = (chunk) => {
    if (state.isConnect) {
      onData(chunk);
    } else if (!socket.destroyed) {
      socket.destroy();
    }
  };

  const handleEnd = () => {
    state.isEnd = true;
    state.isClose = true;
    if (!state.isEndEmit && state.isConnect) {
      state.isEndEmit = true;
      state.isConnect = false;
      onEnd();
    }
    cleanup();
  };
  const handleClose = (hasError) => {
    state.isClose = true;
    if (hasError) {
      if (!state.isErrorEmit && state.isConnect) {
        state.isErrorEmit = true;
        state.isConnect = false;
        onError(new Error('socket had a transmission error'));
      }
    } else {
      state.isEnd = true;
      if (!state.isEndEmit && state.isConnect) {
        state.isConnect = false;
        state.isEndEmit = true;
        onEnd();
      }
    }
    cleanup();
  };

  const handleError = (error) => {
    state.isClose = true;
    if (!state.isErrorEmit && state.isConnect) {
      state.isErrorEmit = true;
      state.isConnect = false;
      onError(error);
    }
    cleanup();
  };

  socket.once('error', handleError);
  socket.on('data', handleData);
  socket.on('drain', handleDrain);
  socket.once('end', handleEnd);
  socket.once('close', handleClose);

  function cleanup() {
    if (!state.isCleanup) {
      state.isCleanup = true;
      socket.off('drain', handleDrain);
      socket.off('data', handleData);
      socket.off('end', handleEnd);
      socket.off('close', handleClose);
    }
  }

  const connect = () => {
    state.isConnect = false;
    if (!socket.destroyed) {
      socket.destroy();
    }
    cleanup();
  };

  connect.pause = () => {
    if (socket.readable) {
      socket.pause();
    }
  };

  connect.resume = () => {
    if (socket.readable) {
      socket.resume();
    }
  };

  connect.write = (chunk) => {
    if (state.isClose || state.isEnd || !state.isConnect) {
      throw new Error('connect ECONNREFUSED');
    }
    if (bufList.length > 0
      || socket.bufferSize > 0
    ) {
      bufList.push(chunk);
      return false;
    }
    return socket.write(chunk);
  };

  connect.end = () => {
    if (!state.isEnd) {
      state.isEnd = true;
      if (socket.writable) {
        if (bufList.length > 0) {
          socket.end(Buffer.concat(bufList));
          while (bufList.length !== 0) {
            bufList.pop();
          }
        } else {
          socket.end();
        }
      }
    }
  };
  return connect;
};
