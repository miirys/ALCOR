import { LogContext } from '../log_context';
import { Logger, LogMethod } from '../types';

const LOG_METHODS: readonly LogMethod[] = ['debug', 'error', 'info', 'warn'];

export function withPrefix(logger: Logger, prefix: string): Logger {
  const addPrefix = (message: string) => `${prefix} ${message}`;

  return LOG_METHODS.reduce((acc, method) => {
    acc[method] = (message: string | Error, e?: Error): void => {
      if (typeof message === 'string') {
        logger[method](addPrefix(message), e);
      } else {
        logger[method](message);
      }
    };

    acc.withContext = (ctx: LogContext) => {
      const newLogger = logger.withContext(ctx);
      return withPrefix(newLogger, prefix);
    };

    return acc;
  }, {} as Logger);
}
