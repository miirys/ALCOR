import dayjs from 'dayjs';
import { Injectable } from '@gitlab/needle';
import { Logger } from './types';
import { LogContext, joinContextsIfDefined } from './log_context';
import { getCtx } from './context_error';
import { LogLevel, LogLevelProvider, LOG_LEVEL } from './log_level';
import { LogWriter } from './log_writer';

const LOG_LEVEL_MAPPING = {
  [LOG_LEVEL.ERROR]: 1,
  [LOG_LEVEL.WARNING]: 2,
  [LOG_LEVEL.INFO]: 3,
  [LOG_LEVEL.DEBUG]: 4,
};

const getNumericMapping = (logLevel: keyof typeof LOG_LEVEL_MAPPING | undefined) => {
  if (logLevel && logLevel in LOG_LEVEL_MAPPING) {
    return LOG_LEVEL_MAPPING[logLevel];
  }
  // Log level could be set as an invalid string by an LS client
  return LOG_LEVEL_MAPPING[LOG_LEVEL.INFO];
};

// pad subsequent lines by 4 spaces
const PADDING = 4;

const ensureError = (e: unknown): Error | undefined => {
  if (e instanceof Error) {
    return e;
  }
  if (typeof e === 'string') {
    return new Error(e);
  }
  if (e === undefined || e === null) {
    return undefined;
  }

  try {
    return new Error(JSON.stringify(e));
  } catch {
    return undefined;
  }
};

const printCtxNode = (node: LogContext, depth: number = 0): string => {
  const indent = (padding: number) => '  '.repeat(padding);
  let result = `${indent(depth)}- ${node.name}:`;

  if (node.value !== undefined) {
    result += ` ${node.value}`;
  }

  result += '\n';

  if (node.children) {
    for (const child of node.children) {
      result += printCtxNode(child, depth + 1);
    }
  }

  return result;
};

const printCtx = (ctx: LogContext): string => {
  return printCtxNode(ctx).trim();
};

@Injectable(Logger, [LogWriter, LogLevelProvider])
export class DefaultLogger implements Logger {
  #logWriter: LogWriter;

  #logLevelProvider: LogLevelProvider;

  #ctx: LogContext | undefined;

  constructor(logWriter: LogWriter, logLevelProvider: LogLevelProvider) {
    this.#logWriter = logWriter;
    this.#logLevelProvider = logLevelProvider;
  }

  /**
   * @param messageOrError can be error (if we don't want to provide any additional info), or a string message
   * @param trailingError is an optional error (if messageOrError was a message)
   *           but we also mention `unknown` type because JS doesn't guarantee that in `catch(e)`,
   *           the `e` is an `Error`, it can be anything.
   * */
  #log(incomingLogLevel: LogLevel, messageOrError: unknown | string, trailingError?: unknown) {
    const configuredLevel = this.#logLevelProvider.logLevel;
    const shouldShowLog = getNumericMapping(configuredLevel) >= LOG_LEVEL_MAPPING[incomingLogLevel];
    if (shouldShowLog) {
      this.#logWithLevel(incomingLogLevel, messageOrError, ensureError(trailingError));
    }
  }

  #logWithLevel(level: LogLevel, a1: unknown | string, a2?: Error) {
    const formatError = (e: Error): string => `${e.stack ?? e.message}`;
    // this method will join the logger context with the error context
    const ctxText = (error: unknown) => {
      const ctx = joinContextsIfDefined('Full Context', this.#ctx, getCtx(error));
      return ctx ? `\n${printCtx(ctx)}` : '';
    };
    if (typeof a1 === 'string') {
      const errorText = a2 ? `\n${formatError(a2)}` : '';
      this.#multilineLog(`${a1}${errorText}${ctxText(a2)}`, level);
    } else {
      const err = ensureError(a1);
      if (!err) return;
      this.#multilineLog(`${formatError(err)}${ctxText(a1)}`, level);
    }
  }

  #multilineLog(line: string, level: LogLevel): void {
    const prefix = `${dayjs().format('YYYY-MM-DDTHH:mm:ss:SSS')} [${level}]: `;
    const padNextLines = (text: string) => text.replace(/\n/g, `\n${' '.repeat(PADDING)}`);

    this.#logWriter.write(`${prefix}${padNextLines(line)}`);
  }

  setContext(ctx: LogContext) {
    this.#ctx = ctx;
  }

  debug(messageOrError: unknown | string, trailingError?: unknown) {
    this.#log(LOG_LEVEL.DEBUG, messageOrError, trailingError);
  }

  info(messageOrError: unknown | string, trailingError?: unknown) {
    this.#log(LOG_LEVEL.INFO, messageOrError, trailingError);
  }

  warn(messageOrError: unknown | string, trailingError?: unknown) {
    this.#log(LOG_LEVEL.WARNING, messageOrError, trailingError);
  }

  error(messageOrError: unknown | string, trailingError?: unknown) {
    this.#log(LOG_LEVEL.ERROR, messageOrError, trailingError);
  }

  withContext(ctx: LogContext): Logger {
    const newLog = new DefaultLogger(this.#logWriter, this.#logLevelProvider);
    newLog.setContext(ctx);
    return newLog;
  }
}
