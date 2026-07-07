import { get } from 'lodash-es';
import { LogContext } from './log_context';

export interface ContextError {
  readonly ctx: LogContext;
}

export const isContextError = (error: unknown): error is ContextError =>
  Boolean(get(error, 'ctx.name'));

export const getCtx = (error: unknown) => (isContextError(error) ? error.ctx : undefined);
