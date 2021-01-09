/* eslint no-use-before-define: 0 */

const connectHandler = (socket, {
  onData,
  onError,
  onEnd,
  onDrain,
  bufList: bList,
  timeout,
}) => {
  if (socket.destroyed) {
    return null;
  }
  const state = {
    isActive: true,
    isEnd: false,

    isEndEmit: false,
    isErrorEmit: false,

    isCleanup: false,

    waited: false,
  };
  const handleErrorOnInit = (error) => {
    if (state.isActive && !state.isErrorEmit && !state.isEndEmit) {
      state.isErrorEmit = true;
      onError(error);
    }
    state.isActive = false;
  };

  socket.once('error', handleErrorOnInit);

  if (socket.connecting || socket.pending || !socket.writable) {
    if (state.isActive) {
      if (!state.isErrorEmit && !state.isEndEmit) {
        state.isErrorEmit = true;
        onError(new Error(socket.connecting || socket.pending ? 'socket is not connect' : 'socket has closed'));
      }
      state.isActive = false;
    }
    if (!socket.destroyed) {
      socket.destroy();
    }
    socket.off('error', handleErrorOnInit);
    return null;
  }

  if (!state.isActive) {
    return null;
  }

  const bufList = [...(bList || [])];

  const handleDrain = () => {
    if (!socket.writable
      || socket.destroyed
      || state.isEnd
      || !state.isActive
    ) {
      return;
    }
    while (bufList.length > 0) {
      const ret = socket.write(bufList.shift());
      if (!ret) {
        break;
      }
    }
    state.waited = bufList.length > 0;
    if (!state.waited && state.isActive && onDrain) {
      onDrain();
    }
  };

  const handleData = (chunk) => {
    if (state.isActive) {
      onData(chunk);
    } else if (socket.destroyed) {
      socket.destroy();
    }
  };

  const handleError = (error) => {
    if (state.isActive && !state.isErrorEmit && !state.isEndEmit) {
      state.isErrorEmit = true;
      onError(error);
    }
    state.isActive = false;
    cleanup();
  };

  const handleEnd = () => {
    if (state.isActive && !state.isErrorEmit && !state.isEndEmit) {
      state.isEndEmit = true;
      onEnd();
    }
    state.isActive = false;
    cleanup();
  };

  const handleClose = (hasError) => {
    if (state.isActive && !state.isErrorEmit && !state.isEndEmit) {
      if (hasError) {
        state.isErrorEmit = true;
        onError(new Error('socket had a transmission error'));
      } else if (!state.isEnd) {
        state.isEndEmit = true;
        onEnd();
      }
    }
    state.isActive = false;
    cleanup();
  };

  const handleTimeout = () => {
    if (state.isActive) {
      socket.end();
    } else if (!socket.destroyed) {
      socket.destroy();
    }
  };

  socket.once('error', handleError);
  socket.off('error', handleErrorOnInit);
  socket.once('end', handleEnd);
  socket.once('close', handleClose);
  socket.on('data', handleData);
  socket.on('drain', handleDrain);
  if (timeout) {
    socket.setTimeout(timeout);
    socket.once('timeout', handleTimeout);
  }

  function cleanup() {
    if (!state.isCleanup) {
      state.isCleanup = true;
      socket.off('drain', handleDrain);
      socket.off('data', handleData);
      socket.off('end', handleEnd);
      socket.off('close', handleClose);
      if (timeout) {
        socket.off('timeout', handleTimeout);
      }
    }
  }

  const connect = () => {
    if (state.isActive) {
      state.isActive = false;
      if (!socket.destroyed) {
        socket.destroy();
      }
      cleanup();
    }
  };

  connect.pause = () => {
    if (socket.readable && !socket.isPaused()) {
      socket.pause();
    }
  };

  connect.resume = () => {
    if (socket.readable && socket.isPaused()) {
      socket.resume();
    }
  };

  connect.write = (chunk) => {
    if (!state.isActive || state.isEnd) {
      throw new Error('connect ECONNREFUSED');
    }
    if (state.waited || bufList.length > 0) {
      if (bufList.length === 0) {
        process.nextTick(() => {
          handleDrain();
        });
      }
      bufList.push(chunk);
      return false;
    }
    const ret = socket.write(chunk);
    if (!ret) {
      state.waited = true;
    }
    return true;
  };

  connect.end = () => {
    if (!state.isActive) {
      return;
    }
    state.isActive = false;
    if (state.isEnd) {
      return;
    }
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
  };

  connect.bufList = bufList;
  connect.socket = socket;
  connect.fresh = handleDrain;

  return connect;
};

module.exports = connectHandler;
