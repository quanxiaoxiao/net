const connectHandler = require('./connectHandler');

module.exports = (
  source,
  dest,
  logger = {
    error: console.error,
    info: console.log,
  },
) => {
  if (!source.writable || !dest.writable) {
    if (!source.destroyed) {
      source.destroy();
    }
    if (!dest.destroyed) {
      dest.destroy();
    }
    return;
  }
  let destWrapper;
  const destHostname = `${dest.remoteAddress}:${dest.remotePort}`;
  const sourceHostname = `${source.remoteAddress}:${source.remotePort}`;
  const sourceWrapper = connectHandler(source, {
    onData: (chunk) => {
      const ret = destWrapper.write(chunk);
      if (!ret) {
        sourceWrapper.pause();
      }
    },
    onError: (error) => {
      logger.error(`${sourceHostname} ${error.message}`);
      destWrapper();
    },
    onEnd: () => {
      logger.info(`${sourceHostname} x->`);
      destWrapper.end();
    },
    onDrain: () => {
      destWrapper.resume();
    },
  });
  destWrapper = connectHandler(dest, {
    onData: (chunk) => {
      const ret = sourceWrapper.write(chunk);
      if (!ret) {
        destWrapper.pause();
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
};
