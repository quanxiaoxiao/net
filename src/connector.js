/* eslint no-use-before-define: 0 */
const net = require('net');

module.exports = ({
  hostname,
  port,
  bufList = [],
  timeout,
}, {
  onData,
  onConnect,
  onError,
  onEnd,
  onDrain,
}) => {
  const client = net.Socket();
  const destBufList = [];
  const state = {
    isActive: true,
    isEnd: false,

    isErrorEmit: false,
    isEndEmit: false,

    isCleanup: false,

    waited: false,

    isConnect: false,
  };

  const handleConnect = () => {
    if (state.isActive) {
      while (bufList.length > 0) {
        client.write(bufList.shift());
      }
      process.nextTick(() => {
        if (state.isActive) {
          state.isConnect = true;
          if (onConnect) {
            onConnect(client);
          }
          while (destBufList.length > 0 && state.isActive) {
            onData(destBufList.shift());
          }
        }
      });
    } else if (!client.destroyed) {
      client.destroy();
    }
  };

  const handleTimeout = () => {
    if (state.isActive) {
      client.end();
    } else if (!client.destroyed) {
      client.destroy();
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
    if (!state.isEnd
      && state.isActive
      && !state.isErrorEmit
      && !state.isEndEmit) {
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

  const handleDrain = () => {
    if (!client.writable
      || client.destroyed
      || !state.isActive
      || state.isEnd
      || !state.isConnect
    ) {
      return;
    }
    while (bufList.length > 0) {
      const ret = client.write(bufList.shift());
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
      if (state.isConnect) {
        onData(chunk);
      } else {
        destBufList.push(chunk);
      }
    } else if (!client.destroyed) {
      client.destroy();
    }
  };

  client.once('error', handleError);
  client.once('connect', handleConnect);
  client.once('end', handleEnd);
  client.once('close', handleClose);
  client.on('data', handleData);
  client.on('drain', handleDrain);
  if (timeout) {
    client.setTimeout(timeout);
    client.once('timeout', handleTimeout);
  }

  function cleanup() {
    if (!state.isCleanup) {
      state.isCleanup = true;
      if (client.connecting) {
        client.off('connect', handleConnect);
      }
      if (timeout) {
        client.off('timeout', handleTimeout);
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
    if (state.isActive) {
      state.isActive = false;
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
    if (!state.isActive || state.isEnd) {
      throw new Error(`connect ECONNREFUSED ${hostname}:${port}`);
    }
    if (state.waited
      || bufList.length > 0
      || !state.isConnect
    ) {
      if (state.isConnect && bufList.length === 0) {
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
    if (!state.isActive) {
      return;
    }
    state.isActive = false;
    if (!state.isConnect) {
      if (client.connecting) {
        client.off('connect', handleConnect);
      }
      if (!client.destroyed) {
        client.destroy();
      }
      return;
    }
    if (state.isEnd) {
      return;
    }
    state.isEnd = true;
    if (client.writable) {
      if (bufList.length > 0) {
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
    if (client.destroyed
      || state.isEnd
      || !state.isActive
    ) {
      return null;
    }
    if (!state.isConnect) {
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
