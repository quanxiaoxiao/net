const connectHandler = require('./connectHandler');

module.exports = (
  source,
  dest,
  logger = {
    error: console.error,
    info: console.log,
  },
) => {
  let destWrapper;
  const destHostname = `${dest.remoteAddress}:${dest.remotePort}`;
  const sourceHostname = `${source.remoteAddress}:${source.remotePort}`;
  const state = {
    isConnect: false,
    destroyed: false,
  };
  const sourceBufList = [];
  const destBufList = [];

  const sourceWrapper = connectHandler(source, {
    onData: (chunk) => {
      if (state.destroyed) {
        sourceWrapper();
        return;
      }
      if (!state.isConnect) {
        sourceBufList.push(chunk);
        sourceWrapper.pause();
        return;
      }
      try {
        const ret = destWrapper.write(chunk);
        if (!ret) {
          sourceWrapper.pause();
        }
      } catch (error) {
        logger.error(error);
        sourceWrapper();
        state.destroyed = true;
      }
    },
    onError: (error) => {
      logger.error(error);
      if (destWrapper) {
        destWrapper();
      }
      state.destroyed = true;
    },
    onEnd: () => {
      logger.info(`${sourceHostname} x->`);
      if (destWrapper) {
        destWrapper.end();
      }
      state.destroyed = true;
    },
    onDrain: () => {
      if (state.isConnect) {
        destWrapper.resume();
      }
    },
  });
  if (!sourceWrapper || state.destroyed) {
    if (!dest.destroyed) {
      dest.destroy();
    }
    state.destroyed = true;
    return;
  }
  destWrapper = connectHandler(dest, {
    onData: (chunk) => {
      if (state.destroyed) {
        destWrapper();
        return;
      }
      if (!state.isConnect) {
        destBufList.push(chunk);
        destWrapper.pause();
        return;
      }
      try {
        const ret = sourceWrapper.write(chunk);
        if (!ret) {
          destWrapper.pause();
        }
      } catch (error) {
        logger.error(error);
        destWrapper();
        state.destroyed = true;
      }
    },
    onError: (error) => {
      logger.error(error);
      sourceWrapper();
      state.destroyed = true;
    },
    onEnd: () => {
      logger.info(`<-x ${destHostname}`);
      sourceWrapper.end();
      state.destroyed = true;
    },
    onDrain: () => {
      if (state.isConnect) {
        sourceWrapper.resume();
      }
    },
  });
  if (!destWrapper) {
    sourceWrapper();
    state.destroyed = true;
  } else {
    try {
      while (destBufList.length > 0) {
        sourceWrapper.write(destBufList.shift());
      }
      while (sourceBufList.length > 0) {
        destWrapper.write(sourceBufList.shift());
      }
    } catch (error) {
      logger.error(error);
      sourceWrapper();
      destWrapper();
      state.destroyed = true;
    }
    process.nextTick(() => {
      if (!state.destroyed) {
        state.isConnect = true;
        destWrapper.resume();
        sourceWrapper.resume();
      }
    });
  }
};
