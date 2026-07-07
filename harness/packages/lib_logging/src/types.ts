import { createInterfaceId } from '@gitlab/needle';
import { LogContext } from './log_context';

export interface Logger {
  debug(e: Error): void;
  debug(message: string, error?: unknown): void;
  info(error: unknown): void;
  info(message: string, error?: unknown): void;
  warn(e: unknown): void;
  warn(message: string, e?: unknown): void;
  error(e: unknown): void;
  error(message: string, e?: unknown): void;
  /**
   * The error is of unknown type because that's the type of the catch(e) argument
   */
  withContext(ctx: LogContext): Logger;
}

export const Logger = createInterfaceId<Logger>('Logger');

export type LogMethod = keyof Omit<Logger, 'withContext'>;
