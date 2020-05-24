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
    isEnd: false,
    isConnect: true,
    isClose: false,
    isErrorEmit: false,
    isEndEmit: false,
    isCleanup: false,
  };

  const handleConnect = () => {
    if (!state.isClose && !state.isEnd && state.isConnect) {
      onConnect(client);
      handleDrain();
    } else {
      client.destroy();
    }
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

  const handleDrain = () => {
    if (state.isClose || state.isEnd || !state.isConnect) {
      if (!client.destroyed) {
        client.destroy();
      }
      return;
    }
    while (client.bufferSize === 0
      && bufList.length > 0) {
      if (!state.isClose && !state.isEnd && state.isConnect && client.writable) {
        const ret = client.write(bufList.shift());
        if (!ret) {
          break;
        }
      } else {
        if (!client.destroyed) {
          client.destroy();
        }
        return;
      }
    }
    if (!state.isConnect) {
      if (!client.destroyed) {
        client.destroy();
      }
    } else if (client.bufferSize === 0) {
      onDrain();
    }
  };

  const handleData = (chunk) => {
    if (state.isConnect) {
      onData(chunk);
    } else if (!client.destroyed) {
      client.destroy();
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
    state.isConnect = false;
    if (client.connecting) {
      client.off('connect', handleConnect);
    }
    if (!client.destroyed) {
      client.destroy();
    }
    cleanup();
  };

  connect.pause = () => {
    if (client.readable) {
      client.pause();
    }
  };

  connect.resume = () => {
    if (client.readable) {
      client.resume();
    }
  };

  connect.write = (chunk) => {
    if (state.isClose || state.isEnd || !state.isConnect) {
      process.nextTick(() => {
        if (!state.isClose && !state.isEnd && !client.destroyed) {
          client.destroy();
        }
      });
      throw new Error(`connect ECONNREFUSED ${hostname}:${port}`);
    }
    if (!client.writable && !client.connecting) {
      if (!client.destroyed) {
        client.destroy();
      }
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
    if (!state.isEnd) {
      state.isEnd = true;
      if (client.connecting) {
        state.isClose = true;
        client.off('connect', handleConnect);
        client.destroy();
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
