/* eslint no-use-before-define: 0 */
const net = require('net');

module.exports = ({
  hostname,
  port,
  bufList = [],
}, {
  onData,
  onConnect,
  onError,
  onEnd,
  onDrain,
}) => {
  const client = net.Socket();
  const state = {
    isEndEmit: false,
  };

  const handleConnect = () => {
    onConnect(client);
    handleDrain();
  };

  const handleError = (error) => {
    cleanup();
    onError(error);
  };

  const handleDrain = () => {
    if (client.destroyed || !client.writable) {
      onError(new Error(`connect ECONNREFUSED ${hostname}:${port}`));
      return;
    }
    while (client.bufferSize === 0
      && bufList.length > 0) {
      if (client.writable) {
        const ret = client.write(bufList.shift());
        if (!ret) {
          break;
        }
      } else {
        cleanup();
        onError(new Error(`connect ECONNREFUSED ${hostname}:${port}`));
        return;
      }
    }
    if (client.bufferSize === 0) {
      onDrain();
    }
  };

  const handleData = (chunk) => {
    onData(chunk);
  };

  const handleEnd = () => {
    if (!state.isEndEmit) {
      state.isEndEmit = true;
      onEnd();
    }
    cleanup();
  };

  const handleClose = (hasError) => {
    if (hasError) {
      onError(new Error('socket had a transmission error'));
    } else if (!state.isEndEmit) {
      state.isEndEmit = true;
      onEnd();
    }
    cleanup();
  };

  client.once('error', handleError);
  client.once('connect', handleConnect);
  client.on('data', handleData);
  client.on('drain', handleDrain);
  client.once('end', handleEnd);
  client.once('close', handleClose);

  function cleanup() {
    if (client.connecting) {
      client.off('connect', handleConnect);
    }
    client.off('drain', handleDrain);
    client.off('data', handleData);
    client.off('end', handleEnd);
    client.off('close', handleClose);
    client.off('error', handleError);
  }

  client.connect({
    host: hostname,
    port,
  });

  const connect = () => {
    cleanup();
    if (!client.destroyed) {
      client.destroy();
    }
  };

  connect.pause = () => {
    if (!client.destroyed && client.readable) {
      client.pause();
    }
  };

  connect.resume = () => {
    if (!client.destroyed && client.readable) {
      client.resume();
    }
  };

  connect.write = (chunk) => {
    if (client.destroyed || (!client.writable && !client.connecting)) {
      cleanup();
      onError(new Error(`connect ECONNREFUSED ${hostname}:${port}`));
      return false;
    }
    if (client.pending
      || client.connecting
      || bufList.length > 0
      || client.bufferSize > 0
    ) {
      bufList.push(chunk);
      return false;
    }
    return client.write(chunk);
  };

  connect.end = () => {
    if (client.connecting) {
      client.off('connect', handleConnect);
      cleanup();
      client.destroy();
    } else {
      cleanup();
      if (client.writable && bufList.length > 0) {
        client.end(Buffer.concat(bufList));
        while (bufList.length !== 0) {
          bufList.pop();
        }
      } else {
        client.end();
      }
    }
  };

  connect.detach = () => {
    cleanup();
    return client;
  };

  return connect;
};
