/* eslint no-use-before-define: 0 */
import net from 'node:net';

const checkStateEmitable = (state) => !state.isEnd
  && state.isActive
  && !state.isErrorEmit
  && !state.isEndEmit;

export default ({
  hostname,
  port,
  bufList = [],
  timeout = 1000 * 30,
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

  function handleTimeout() {
    if (checkStateEmitable(state)) {
      state.isErrorEmit = true;
      onError(new Error('socket timeout'));
    }
    state.isActive = false;
    cleanup();
    if (!client.destroyed) {
      client.destroy();
    }
  }

  function handleConnect() {
    if (state.isActive) {
      while (state.isActive && bufList.length > 0) {
        client.write(bufList.shift());
      }
      process.nextTick(() => {
        if (state.isActive && !state.isEnd) {
          state.isConnect = true;
          if (onConnect) {
            onConnect(client);
          }
          if (state.waited) {
            state.waited = false;
            if (onDrain) {
              onDrain();
            }
          }
          client.on('data', handleData);
          client.on('drain', handleDrain);
        }
      });
    }
  }

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

  const handleDrain = () => {
    while (state.isActive && bufList.length > 0) {
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

  if (timeout != null && timeout > 0) {
    client.once('timeout', handleTimeout);
  }

  function cleanup() {
    if (!state.isCleanup) {
      state.isCleanup = true;
      if (client.connecting) {
        client.off('connect', handleConnect);
      }
      if (state.isConnect) {
        client.off('drain', handleDrain);
        client.off('data', handleData);
      }
      if (timeout != null) {
        client.off('timeout', handleTimeout);
      }
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
      cleanup();
      if (!client.destroyed) {
        client.destroy();
      }
    }
  };

  connect.pause = () => {
    if (state.isConnect
      && client.readable
      && !client.isPaused()) {
      client.pause();
    }
  };

  connect.resume = () => {
    if (state.isConnect
      && client.readable
      && client.isPaused()) {
      client.resume();
    }
  };

  connect.write = (chunk) => {
    if (!state.isActive || state.isEnd) {
      throw new Error(`socket \`${hostname}:${port}\` already close`);
    }
    if (state.waited
      || bufList.length > 0
      || !state.isConnect
    ) {
      state.waited = true;
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
    if (state.isActive && !state.isEnd) {
      state.isEnd = true;
      if (state.isConnect) {
        state.isCleanup = true;
        client.off('data', handleData);
        client.off('drain', handleDrain);
        client.off('close', handleClose);
        client.off('end', handleEnd);
        if (bufList.length > 0) {
          client.end(Buffer.concat(bufList));
        } else {
          client.end();
        }
      } else {
        state.isActive = false;
        if (client.connecting) {
          client.off('connect', handleConnect);
        }
        cleanup();
        if (!client.destroyed) {
          client.destroy();
        }
      }
    }
  };

  return connect;
};
