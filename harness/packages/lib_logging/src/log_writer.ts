import { createInterfaceId } from '@gitlab/needle';
import { LogLevel } from './log_level';

export interface LogWriter {
  /** writes a string and appends a new line */
  write(msg: string, logLevel?: LogLevel): void;
  /** flushes any buffered writes */
  flush?(): Promise<void>;
}
export const LogWriter = createInterfaceId<LogWriter>('LogWriter');
