// Test stub for electron-log (the provider imports `log` for diagnostics).
const noop = () => {};
const log = {
  info: noop,
  warn: noop,
  error: noop,
  debug: noop,
  verbose: noop,
  silly: noop,
  transports: { console: {}, ipc: {}, file: {} }
};
export default log;
