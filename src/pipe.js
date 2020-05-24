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
  const sourceWrapper = connectHandler(source, {
    onData: (chunk) => {
      if (!destWrapper) {
        sourceWrapper();
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
      }
    },
    onError: (error) => {
      if (destWrapper) {
        logger.error(`${sourceHostname} ${error.message}`);
        destWrapper();
      }
    },
    onEnd: () => {
      if (destWrapper) {
        logger.info(`${sourceHostname} x->`);
        destWrapper.end();
      }
    },
    onDrain: () => {
      if (!destWrapper) {
        sourceWrapper();
      } else {
        destWrapper.resume();
      }
    },
  });
  if (sourceWrapper) {
    destWrapper = connectHandler(dest, {
      onData: (chunk) => {
        try {
          const ret = sourceWrapper.write(chunk);
          if (!ret) {
            destWrapper.pause();
          }
        } catch (error) {
          logger.error(error);
          destWrapper();
        }
      },
      onError: (error) => {
        logger.error(`${destHostname} ${error.message}`);
        sourceWrapper();
      },
      onEnd: () => {
        logger.info(`<-x ${destHostname}`);
        sourceWrapper.end();
      },
      onDrain: () => {
        sourceWrapper.resume();
      },
    });
    if (!destWrapper) {
      sourceWrapper();
    }
  }
};
