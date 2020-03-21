/* eslint no-use-before-define: 0 */

module.exports = (socket, {
  onData,
  onError,
  onEnd,
  onDrain,
}) => {
  const bufList = [];
  const handleDrain = () => {
    while (!socket.destroyed
      && socket.writable
      && socket.bufferSize === 0
      && bufList.length > 0) {
      socket.write(bufList.shift());
    }
    if (socket.bufferSize === 0) {
      onDrain();
    }
  };
  const handleData = (chunk) => {
    onData(chunk);
  };
  const handleEnd = () => {
    cleanup();
    onEnd();
  };
  const handleClose = (hasError) => {
    if (hasError) {
      onError(new Error('socket had a transmission error'));
    } else {
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
    if (!socket.writable) {
      cleanup();
    } else if (bufList.length > 0) {
      socket.end(Buffer.concat(bufList));
    } else {
      socket.end();
    }
  };
  return connect;
};
