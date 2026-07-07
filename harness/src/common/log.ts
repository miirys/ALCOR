import { Logger, LogContext, LOG_LEVEL, DefaultLogger } from '@gitlab-org/logging';
import { ConfigService } from '@gitlab-org/config';
import { ConfigLogLevelProvider } from './config_log_level_provider';

class GlobalLog implements Logger {
  #log: Logger;

  #logWriter: { write: (m: string) => void };

  constructor() {
    this.#logWriter = { write: (m: string) => console.log(m) };
    this.#log = new DefaultLogger(this.#logWriter, { logLevel: LOG_LEVEL.INFO });
  }

  setup(configService: ConfigService, logWriter?: { write: (m: string) => void }) {
    if (logWriter) {
      this.#logWriter = logWriter;
    }
    this.#log = new DefaultLogger(this.#logWriter, new ConfigLogLevelProvider(configService));
  }

  debug(messageOrError: unknown | string, trailingError?: unknown) {
    this.#log.debug(messageOrError as string, trailingError);
  }

  info(messageOrError: unknown | string, trailingError?: unknown) {
    this.#log.info(messageOrError as string, trailingError);
  }

  warn(messageOrError: unknown | string, trailingError?: unknown) {
    this.#log.warn(messageOrError as string, trailingError);
  }

  error(messageOrError: unknown | string, trailingError?: unknown) {
    this.#log.error(messageOrError as string, trailingError);
  }

  withContext(ctx: LogContext): Logger {
    return this.#log.withContext(ctx);
  }
}

// TODO: rename the export and replace usages of `log` with `Log`.
export const log = new GlobalLog();
