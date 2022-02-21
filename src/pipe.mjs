import connectHandler from './connectHandler.mjs';

export default (
  source,
  dest,
  logger,
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

  const printError = (error) => {
    if (process.env.NODE_ENV === 'development') {
      console.error(error);
    }
    if (logger && logger.warn) {
      logger.warn(error.message);
    }
  };

  const print = (message) => {
    if (logger && logger.info) {
      logger.info(message);
    }
  };

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
        printError(error);
        sourceWrapper();
        state.destroyed = true;
      }
    },
    onError: (error) => {
      printError(error);
      if (destWrapper) {
        destWrapper();
      }
      state.destroyed = true;
    },
    onEnd: () => {
      print(`${sourceHostname} x->`);
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
        printError(error);
        destWrapper();
        state.destroyed = true;
      }
    },
    onError: (error) => {
      printError(error);
      sourceWrapper();
      state.destroyed = true;
    },
    onEnd: () => {
      print(`<-x ${destHostname}`);
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
      printError(error);
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
