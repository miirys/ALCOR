/**
 * Browser-safe entry point for @gitlab-org/logging.
 *
 * Excludes DefaultLogger which depends on @gitlab/needle (DI framework)
 * that uses decorators not compatible with browser environments.
 */
export * from './types';
export { withPrefix } from './utils/with_prefix';
export { NullLogger } from './null_logger';
export { TestLogger } from './test_logger';
export { type LogContext, logCtxItem, logCtxParent, joinContextsIfDefined } from './log_context';
export { type ContextError, isContextError, getCtx } from './context_error';
export { LOG_LEVEL, type LogLevel, LogLevelProvider } from './log_level';
export { LogWriter } from './log_writer';
