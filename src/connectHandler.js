/* eslint no-use-before-define: 0 */

const connectHandler = (socket, {
  onData,
  onError,
  onEnd,
  onDrain,
  bufList: bList,
}) => {
  const state = {
    isConnect: true,
    isEnd: false,
    isClose: false,

    isEndEmit: false,
    isErrorEmit: false,

    isCleanup: false,
  };
  const handleErrorOnInit = (error) => {
    state.isClose = true;
    if (state.isConnect && !state.isErrorEmit && !state.isEndEmit) {
      state.isErrorEmit = true;
      onError(error);
      state.isConnect = false;
    }
  };

  const destroy = () => {
    if (!socket.destroyed) {
      socket.destroy();
    } else if (state.isConnect && !state.isErrorEmit && !state.isEndEmit) {
      state.isErrorEmit = true;
      onError(new Error('socket had a transmission error'));
      state.isConnect = false;
      cleanup();
    }
  };

  socket.once('error', handleErrorOnInit);

  if (socket.connecting || socket.pending) {
    if (state.isConnect && !state.isErrorEmit && !state.isEndEmit) {
      state.isErrorEmit = true;
      onError(new Error('socket is not connect'));
      state.isConnect = false;
    }
    if (!socket.destroyed) {
      socket.destroy();
    }
    return null;
  }

  if (!socket.writable || state.isClose) {
    if (state.isConnect && !state.isErrorEmit && !state.isEndEmit) {
      state.isErrorEmit = true;
      onError(new Error('socket has closed'));
      state.isConnect = false;
    }
    return null;
  }

  const bufList = [...(bList || [])];

  const handleDrain = () => {
    if (!socket.writable || socket.destroyed) {
      return;
    }
    let ret = true;
    const bufSize = bufList.length;
    while (bufList.length > 0) {
      ret = socket.write(bufList.shift());
      if (!ret) {
        break;
      }
    }
    if (bufSize && ret && state.isConnect && onDrain) {
      onDrain();
    }
  };

  const handleData = (chunk) => {
    if (state.isConnect) {
      onData(chunk);
    } else {
      destroy();
    }
  };

  const handleError = (error) => {
    state.isClose = true;
    if (state.isConnect && !state.isErrorEmit && !state.isEndEmit) {
      state.isErrorEmit = true;
      onError(error);
      state.isConnect = false;
    }
    cleanup();
  };

  const handleEnd = () => {
    state.isClose = true;
    if (state.isConnect && !state.isErrorEmit && !state.isEndEmit) {
      state.isEndEmit = true;
      onEnd();
      state.isConnect = false;
    }
    cleanup();
  };

  const handleClose = (hasError) => {
    state.isClose = true;
    if (hasError) {
      if (state.isConnect && !state.isErrorEmit && !state.isEndEmit) {
        state.isErrorEmit = true;
        onError(new Error('socket had a transmission error'));
        state.isConnect = false;
      }
    } else if (state.isConnect && !state.isErrorEmit && !state.isEndEmit) {
      state.isEndEmit = true;
      onEnd();
      state.isConnect = false;
    }
    cleanup();
  };

  socket.once('error', handleError);
  socket.off('error', handleErrorOnInit);
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
    if (state.isConnect) {
      state.isConnect = false;
      if (!socket.destroyed) {
        socket.destroy();
      }
      cleanup();
    }
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
    if (!state.isConnect || state.isClose || state.isEnd) {
      throw new Error('connect ECONNREFUSED');
    }
    if (!socket.writable) {
      throw new Error('EPIPE');
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
    state.isConnect = false;
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
