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
    isConnect: true,
    isEnd: false,
    isClose: false,

    isErrorEmit: false,
    isEndEmit: false,

    isCleanup: false,

    waited: false,
  };

  const destroy = () => {
    if (!client.destroyed) {
      client.destroy();
    } else if (state.isConnect && !state.isErrorEmit && !state.isEndEmit) {
      state.isErrorEmit = true;
      onError(new Error('socket had a transmission error'));
      state.isConnect = false;
      cleanup();
    }
  };

  const handleConnect = () => {
    if (state.isConnect) {
      if (onConnect) {
        onConnect(client);
      }
      handleDrain();
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

  const handleDrain = () => {
    if (!client.writable || client.destroyed) {
      return;
    }
    while (bufList.length > 0) {
      const ret = client.write(bufList.shift());
      if (!ret) {
        break;
      }
    }
    state.waited = bufList.length > 0;
    if (!state.waited && state.isConnect && onDrain) {
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

  client.once('error', handleError);
  client.once('connect', handleConnect);
  client.once('end', handleEnd);
  client.once('close', handleClose);
  client.on('data', handleData);
  client.on('drain', handleDrain);

  function cleanup() {
    if (!state.isCleanup) {
      state.isCleanup = true;
      if (client.connecting) {
        client.off('connect', handleConnect);
      }
      client.off('drain', handleDrain);
      client.off('data', handleData);
      client.off('end', handleEnd);
      client.off('close', handleClose);
    }
  }

  client.connect({
    host: hostname,
    port,
  });

  const connect = () => {
    if (state.isConnect) {
      state.isConnect = false;
      if (client.connecting) {
        client.off('connect', handleConnect);
      }
      if (!client.destroyed) {
        client.destroy();
      }
      cleanup();
    }
  };

  connect.pause = () => {
    if (client.readable && !client.isPaused()) {
      client.pause();
    }
  };

  connect.resume = () => {
    if (client.readable && client.isPaused()) {
      client.resume();
    }
  };

  connect.write = (chunk) => {
    if (!state.isConnect || state.isClose || state.isEnd) {
      throw new Error(`connect ECONNREFUSED ${hostname}:${port}`);
    }
    if (!client.writable && !client.connecting) {
      throw new Error(`EPIPE ${hostname}:${port}`);
    }
    if (client.pending
      || client.connecting
      || state.waited
      || bufList.length > 0
    ) {
      if (!client.pending && !client.connecting && bufList.length === 0) {
        process.nextTick(() => {
          handleDrain();
        });
      }
      bufList.push(chunk);
      return false;
    }
    const ret = client.write(chunk);
    if (!ret) {
      state.waited = true;
    }
    return true;
  };

  connect.end = () => {
    state.isConnect = false;
    if (!state.isEnd) {
      state.isEnd = true;
      if (client.connecting) {
        state.isClose = true;
        client.off('connect', handleConnect);
        client.destroy();
        cleanup();
      } else if (client.writable) {
        if (bufList.length > 0) {
          client.end(Buffer.concat(bufList));
          while (bufList.length !== 0) {
            bufList.pop();
          }
        } else {
          client.end();
        }
      }
    }
  };

  connect.detach = () => {
    if (client.destroyed || state.isEnd || state.isClose) {
      return null;
    }
    if (client.connecting) {
      client.destroy();
      cleanup();
      return null;
    }
    cleanup();
    client.off('error', handleError);
    return client;
  };

  connect.bufList = bufList;
  connect.socket = client;
  connect.fresh = handleDrain;

  return connect;
};
