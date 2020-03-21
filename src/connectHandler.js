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
  const bufList = [];
  let isEndEmit = false;
  const handleDrain = () => {
    if (socket.destroyed || !socket.writable) {
      onError(new Error('connect ECONNREFUSED'));
      return;
    }
    while (socket.bufferSize === 0
      && bufList.length > 0) {
      if (socket.writable) {
        const ret = socket.write(bufList.shift());
        if (!ret) {
          break;
        }
      } else {
        cleanup();
        onError(new Error('connect ECONNREFUSED'));
        return;
      }
    }
    if (socket.bufferSize === 0) {
      onDrain();
    }
  };
  const handleData = (chunk) => {
    onData(chunk);
  };
  const handleEnd = () => {
    if (!isEndEmit) {
      isEndEmit = true;
      onEnd();
    }
    cleanup();
  };
  const handleClose = (hasError) => {
    if (hasError) {
      onError(new Error('socket had a transmission error'));
    } else if (!isEndEmit) {
      isEndEmit = true;
      onEnd();
    }
    cleanup();
  };
  const handleError = (error) => {
    cleanup();
    onError(error);
  };

  socket.once('error', handleError);
  socket.on('data', handleData);
  socket.on('drain', handleDrain);
  socket.once('end', handleEnd);
  socket.once('close', handleClose);

  function cleanup() {
    socket.off('drain', handleDrain);
    socket.off('data', handleData);
    socket.off('end', handleEnd);
    socket.off('close', handleClose);
    socket.off('error', handleError);
  }
  const connect = () => {
    cleanup();
    if (!socket.destroyed) {
      socket.destroy();
    }
  };

  connect.pause = () => {
    if (!socket.destroyed && socket.readable) {
      socket.pause();
    }
  };

  connect.resume = () => {
    if (!socket.destroyed && socket.readable) {
      socket.resume();
    }
  };

  connect.write = (chunk) => {
    if (socket.destroyed || !socket.writable) {
      cleanup();
      onError(new Error('connect ECONNREFUSED'));
      return false;
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
    if (socket.writable) {
      if (bufList.length > 0) {
        socket.end(Buffer.concat(bufList));
        while (bufList.length !== 0) {
          bufList.pop();
        }
      } else {
        socket.end();
      }
    } else if (!socket.destroyed) {
      cleanup();
      socket.destroyed();
    }
  };
  return connect;
};
