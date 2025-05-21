/**
 * Minimal logger implementation - only logs errors to console
 * All other log levels are no-ops to improve performance
 */

const Logger = {
  error: (message, ...args) => console.error(message, ...args),
  warn: () => {},  // No-op
  info: () => {},  // No-op
  debug: () => {}  // No-op
};

export default Logger; 