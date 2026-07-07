import { createInterfaceId } from '@gitlab/needle';

export const LOG_LEVEL = {
  DEBUG: 'debug',
  INFO: 'info',
  WARNING: 'warning',
  ERROR: 'error',
} as const;

export type LogLevel = (typeof LOG_LEVEL)[keyof typeof LOG_LEVEL];

export const LogLevelProvider = createInterfaceId<LogLevelProvider>('LogLevelProvider');

export interface LogLevelProvider {
  logLevel: LogLevel;
}
