/* eslint no-use-before-define: 0 */
import net from 'node:net';
import dns from 'node:dns';

export default ({
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
  const state = {
    isActive: true,
    isEnd: false,

    isErrorEmit: false,
    isEndEmit: false,

    isCleanup: false,

    waited: false,

    isConnect: false,
  };

  const getStateEmitable = () => !state.isEnd
    && state.isActive
    && !state.isErrorEmit
    && !state.isEndEmit;

  const handleConnect = () => {
    if (state.isActive) {
      const isDrainEmit = bufList.length > 0;
      while (bufList.length > 0) {
        client.write(bufList.shift());
      }
      process.nextTick(() => {
        if (state.isActive) {
          state.isConnect = true;
          if (!state.isEnd && onConnect) {
            onConnect(client);
          }
          if (!state.isEnd && isDrainEmit && onDrain) {
            onDrain();
          }
        }
      });
    } else if (!client.destroyed) {
      client.destroy();
    }
  };

  const handleTimeout = () => {
    client.end();
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

  const handleDrain = () => {
    while (bufList.length > 0) {
      const ret = client.write(bufList.shift());
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
      client.off('data', handleData);
    }
  };

  client.once('error', handleError);
  client.once('connect', handleConnect);
  client.once('end', handleEnd);
  client.once('close', handleClose);
  client.on('data', handleData);
  client.on('drain', handleDrain);

  if (timeout != null) {
    client.setTimeout(timeout);
    client.once('timeout', handleTimeout);
  }

  function cleanup() {
    if (!state.isCleanup) {
      state.isCleanup = true;
      if (client.connecting) {
        client.off('connect', handleConnect);
      }
      if (timeout != null) {
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
    lookup: (host, options, cb) => dns.lookup(host, {
      ...options,
      family: 6,
      hints: dns.ADDRCONFIG | dns.V4MAPPED,
    }, cb),
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
      throw new Error(`socket has close ${hostname}:${port}`);
    }
    if (state.waited
      || bufList.length > 0
      || !state.isConnect
    ) {
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
    if (!state.isActive || state.isEnd) {
      return;
    }
    client.off('data', handleData);
    client.off('drain', handleDrain);
    state.isEnd = true;
    if (!state.isConnect) {
      state.isActive = false;
      if (client.connecting) {
        client.off('connect', handleConnect);
      }
      if (!client.destroyed) {
        client.destroy();
      }
    } else if (bufList.length > 0) {
      client.end(Buffer.concat(bufList));
    } else {
      client.end();
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
