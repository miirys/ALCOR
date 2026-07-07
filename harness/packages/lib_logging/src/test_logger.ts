import { LogContext } from './log_context';
import { Logger } from './types';

type LogEntry = { message?: string; error?: unknown; ctx?: LogContext };

export class TestLogger implements Logger {
  #ctx?: LogContext;

  #debugLogs: LogEntry[] = [];

  #infoLogs: LogEntry[] = [];

  #warnLogs: LogEntry[] = [];

  #errorLogs: LogEntry[] = [];

  #makeEntry(message: unknown, error?: unknown): LogEntry {
    return typeof message === 'string'
      ? { message, error, ctx: this.#ctx }
      : { error: message, ctx: this.#ctx };
  }

  debug(message: unknown, error?: unknown): void {
    this.#debugLogs.push(this.#makeEntry(message, error));
  }

  info(message: unknown, error?: unknown): void {
    this.#infoLogs.push(this.#makeEntry(message, error));
  }

  warn(message: unknown, error?: unknown): void {
    this.#warnLogs.push(this.#makeEntry(message, error));
  }

  error(message: unknown, error?: unknown): void {
    this.#errorLogs.push(this.#makeEntry(message, error));
  }

  withContext(ctx: LogContext): Logger {
    this.#ctx = ctx;
    return this;
  }

  clear() {
    this.#debugLogs = [];
    this.#infoLogs = [];
    this.#warnLogs = [];
    this.#errorLogs = [];
  }

  get debugLogs() {
    return this.#debugLogs;
  }

  get infoLogs() {
    return this.#infoLogs;
  }

  get warnLogs() {
    return this.#warnLogs;
  }

  get errorLogs() {
    return this.#errorLogs;
  }

  get nonDebugLogs() {
    return [...this.#infoLogs, ...this.#warnLogs, ...this.#errorLogs];
  }
}
