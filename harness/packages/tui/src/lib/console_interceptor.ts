import { inspect } from 'node:util';
import { Logger } from '@gitlab-org/logging';

type CleanUpFunc = () => void;

interface ConsoleMethods {
  log: typeof console.log;
  error: typeof console.error;
  warn: typeof console.warn;
  debug: typeof console.debug;
}

/**
 * Intercepts console methods to filter unwanted output and route through Logger.
 */
export const interceptConsole = (logger: Logger): CleanUpFunc => {
  /* eslint-disable no-console */
  const originalConsole: ConsoleMethods = {
    log: console.log,
    error: console.error,
    warn: console.warn,
    debug: console.debug,
  };

  const serializeArgs = (args: unknown[]): string => {
    return args
      .map((arg) => {
        if (typeof arg === 'string') return arg;
        if (arg instanceof Error) return arg.stack || arg.message;
        return inspect(arg, { depth: 3, breakLength: Infinity, compact: true });
      })
      .join(' ');
  };

  console.log = (...args: unknown[]) => {
    logger.info(`Console: ${serializeArgs(args)}`);
  };

  console.error = (...args: unknown[]) => {
    logger.error(`Console error: ${serializeArgs(args)}`);
  };

  console.warn = (...args: unknown[]) => {
    logger.warn(`Console warning: ${serializeArgs(args)}`);
  };

  console.debug = (...args: unknown[]) => {
    logger.debug(`Console debug: ${serializeArgs(args)}`);
  };

  // Return cleanup function to restore original console methods
  return () => {
    console.log = originalConsole.log;
    console.error = originalConsole.error;
    console.warn = originalConsole.warn;
    console.debug = originalConsole.debug;
  };
  /* eslint-enable no-console */
};
