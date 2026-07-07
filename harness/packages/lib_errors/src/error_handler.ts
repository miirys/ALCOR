import { createInterfaceId, Injectable } from '@gitlab/needle';
import { logCtxParent, Logger } from '@gitlab-org/logging';
import { SystemContext, AuthContext } from '@gitlab-org/request-context';
import { ErrorTracker } from './error_tracker';
import { SanitizedError } from './sanitized_error';

export interface ErrorHandler {
  handleError(message: string, error: unknown, additionalData?: Record<string, unknown>): void;
  dispose?(): Promise<void>;
}

export const ErrorHandler = createInterfaceId<ErrorHandler>('ErrorHandler');

@Injectable(ErrorHandler, [Logger, ErrorTracker, SystemContext, AuthContext])
export class DefaultErrorHandler implements ErrorHandler {
  #errorTracker: ErrorTracker;

  #systemContext: SystemContext;

  #authContext: AuthContext;

  #logger: Logger;

  constructor(
    logger: Logger,
    errorTracker: ErrorTracker,
    systemContext: SystemContext,
    authContext: AuthContext,
  ) {
    this.#errorTracker = errorTracker;
    this.#systemContext = systemContext;
    this.#authContext = authContext;
    this.#logger = logger;
  }

  handleError(message: string, e?: unknown, additionalData?: Record<string, unknown>): void {
    const error = e instanceof SanitizedError ? e.originalError : e;
    const ctx = logCtxParent('Server Context', this.#systemContext, this.#authContext);
    this.#logger.withContext(ctx).error(message, error);
    if (this.#isTrackableError(e)) {
      this.#errorTracker.trackError(e, additionalData);
    }
  }

  #isTrackableError(error: unknown): error is SanitizedError {
    return error instanceof SanitizedError;
  }

  async dispose(): Promise<void> {
    await this.#errorTracker.dispose?.();
  }
}
