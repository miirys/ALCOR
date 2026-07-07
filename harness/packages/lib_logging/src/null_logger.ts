import { Logger } from './types';

export class NullLogger implements Logger {
  debug(): void {
    // NOOP
  }

  info(): void {
    // NOOP
  }

  warn(): void {
    // NOOP
  }

  error(): void {
    // NOOP
  }

  withContext(): Logger {
    return this;
  }
}
