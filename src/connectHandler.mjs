/* eslint no-use-before-define: 0 */
const checkStateEmitable = (state) => !state.isEnd
  && state.isActive
  && !state.isErrorEmit
  && !state.isEndEmit;

export default (socket, {
  onData,
  onError,
  onEnd,
  onDrain,
  bufList: bList,
  timeout = 1000 * 30,
}) => {
  if (socket.destroyed || (!socket.readable && !socket.writable)) {
    onError(new Error('socket already close'));
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
    if (checkStateEmitable(state)) {
      state.isErrorEmit = true;
      onError(error);
    }
    state.isActive = false;
  };

  socket.once('error', handleErrorOnInit);

  if (socket.connecting || socket.pending) {
    if (state.isActive) {
      if (checkStateEmitable(state)) {
        state.isErrorEmit = true;
        onError(new Error('socket is not connect'));
      }
      state.isActive = false;
    }
    if (!socket.destroyed) {
      socket.destroy();
    }
    return null;
  }

  if (!state.isActive) {
    return null;
  }

  function handleTimeout() {
    if (checkStateEmitable(state)) {
      state.isErrorEmit = true;
      onError(new Error('timeout'));
    }
    state.isActive = false;
    cleanup();
    if (!socket.destroyed) {
      socket.destroy();
    }
  }

  const bufList = [...(bList || [])];

  const handleDrain = () => {
    while (state.isActive && bufList.length > 0) {
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
    if (checkStateEmitable(state)) {
      state.isErrorEmit = true;
      onError(error);
    }
    state.isActive = false;
    cleanup();
  };

  const handleEnd = () => {
    if (checkStateEmitable(state)) {
      state.isEndEmit = true;
      onEnd();
    }
    state.isActive = false;
    cleanup();
  };

  const handleClose = (hasError) => {
    if (checkStateEmitable(state)) {
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

  socket.once('error', handleError);
  socket.once('end', handleEnd);
  socket.once('close', handleClose);
  socket.on('data', handleData);
  socket.on('drain', handleDrain);
  if (timeout != null && timeout > 0) {
    socket.on('timeout', handleTimeout);
  }

  process.nextTick(() => {
    socket.off('error', handleErrorOnInit);
  });

  function cleanup() {
    if (!state.isCleanup) {
      state.isCleanup = true;
      socket.off('drain', handleDrain);
      socket.off('data', handleData);
      if (timeout != null) {
        socket.off('timeout', handleTimeout);
      }
      socket.off('end', handleEnd);
      socket.off('close', handleClose);
    }
  }

  const connect = () => {
    if (state.isActive) {
      state.isActive = false;
      cleanup();
      if (!socket.destroyed) {
        socket.destroy();
      }
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
      state.waited = true;
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
    if (state.isActive && !state.isEnd) {
      state.isEnd = true;
      state.isCleanup = true;
      socket.off('drain', handleDrain);
      socket.off('data', handleData);
      socket.off('close', handleClose);
      socket.off('end', handleEnd);
      if (bufList.length > 0) {
        socket.end(Buffer.concat(bufList));
      } else {
        socket.end();
      }
    }
  };

  return connect;
};
