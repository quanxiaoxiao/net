/* eslint no-use-before-define: 0 */

const connectHandler = (socket, {
  onData,
  onError,
  onEnd,
  onDrain,
  bufList: bList,
}) => {
  const state = {
    isEnd: false,
    isConnect: true,
    isClose: false,
    isEndEmit: false,
    isErrorEmit: false,
    isCleanup: false,
  };
  const handleErrorOnStart = (error) => {
    state.isClose = true;
    state.isConnect = false;
    if (!state.isErrorEmit) {
      state.isErrorEmit = true;
      onError(error);
    }
  };
  socket.once('error', handleErrorOnStart);
  if (socket.connecting || socket.pending) {
    if (!socket.destroyed) {
      state.isClose = true;
      state.isConnect = false;
      socket.destroy();
    }
    if (!state.isErrorEmit) {
      state.isErrorEmit = true;
      onError(new Error('socket is not connect'));
    }
    return null;
  }
  if (!socket.writable || state.isClose) {
    if (!state.isErrorEmit) {
      state.isErrorEmit = true;
      onError(new Error('socket has closed'));
    }
    return null;
  }

  const bufList = [...(bList || [])];

  const handleDrain = () => {
    if (state.isClose || !state.isConnect) {
      if (!socket.destroyed) {
        socket.destroy();
      }
      return;
    }
    if (state.isEnd) {
      return;
    }
    let ret = true;
    while (bufList.length > 0) {
      if (!state.isClose && !state.isEnd && state.isConnect && socket.writable) {
        ret = socket.write(bufList.shift());
        if (!ret) {
          break;
        }
      } else {
        if (!socket.destroyed && !state.isEnd) {
          socket.destroy();
        }
        return;
      }
    }
    if (!state.isConnect) {
      if (!socket.destroyed) {
        socket.destroy();
      }
    } else if (ret) {
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
    state.isClose = true;
    if (!state.isEnd && !state.isEndEmit && state.isConnect) {
      state.isEndEmit = true;
      state.isConnect = false;
      onEnd();
    }
    state.isEnd = true;
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
      if (!state.isEnd && !state.isEndEmit && state.isConnect) {
        state.isConnect = false;
        state.isEndEmit = true;
        onEnd();
      }
      state.isEnd = true;
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
  socket.off('error', handleErrorOnStart);
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
      process.nextTick(() => {
        if (!state.isClose && !state.isEnd && !socket.destroyed) {
          socket.destroy();
        }
      });
      throw new Error('connect ECONNREFUSED');
    }
    if (bufList.length > 0) {
      bufList.push(chunk);
      process.nextTick(() => {
        handleDrain();
      });
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

  connect.bufList = bufList;
  connect.socket = socket;
  connect.fresh = handleDrain;

  return connect;
};

module.exports = connectHandler;
