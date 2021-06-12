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
  const getStateEmitable = () => !state.isEnd
    && state.isActive
    && !state.isErrorEmit
    && !state.isEndEmit;

  const handleErrorOnInit = (error) => {
    if (getStateEmitable()) {
      state.isErrorEmit = true;
      onError(error);
    }
    state.isActive = false;
  };

  socket.once('error', handleErrorOnInit);

  if (socket.connecting || socket.pending || !socket.writable) {
    if (state.isActive) {
      if (getStateEmitable()) {
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
    while (bufList.length > 0) {
      const ret = socket.write(bufList.shift());
      if (!ret) {
        break;
      }
    }
    state.waited = bufList.length > 0;
    if (!state.waited
      && !state.isEnd
      && state.isActive
      && onDrain) {
      onDrain();
    }
  };

  const handleData = (chunk) => {
    if (state.isActive) {
      onData(chunk);
    } else {
      socket.off('data', handleData);
    }
  };

  const handleError = (error) => {
    if (getStateEmitable()) {
      state.isErrorEmit = true;
      onError(error);
    }
    state.isActive = false;
    cleanup();
  };

  const handleEnd = () => {
    if (getStateEmitable()) {
      state.isEndEmit = true;
      onEnd();
    }
    state.isActive = false;
    cleanup();
  };

  const handleClose = (hasError) => {
    if (getStateEmitable()) {
      if (hasError) {
        state.isErrorEmit = true;
        onError(new Error('socket had a transmission error'));
      } else {
        state.isEndEmit = true;
        onEnd();
      }
    }
    state.isActive = false;
    cleanup();
  };

  const handleTimeout = () => {
    socket.end();
  };

  socket.once('error', handleError);
  socket.off('error', handleErrorOnInit);
  socket.once('end', handleEnd);
  socket.once('close', handleClose);
  socket.on('data', handleData);
  socket.on('drain', handleDrain);
  if (timeout != null) {
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
      if (timeout != null) {
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
    if (!state.isActive || state.isEnd) {
      return;
    }
    socket.off('data', handleData);
    state.isEnd = true;
    if (bufList.length > 0) {
      socket.end(Buffer.concat(bufList));
    } else {
      socket.end();
    }
  };

  connect.bufList = bufList;
  connect.socket = socket;
  connect.fresh = handleDrain;

  return connect;
};

module.exports = connectHandler;
