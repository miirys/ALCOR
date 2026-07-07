import { logCtxItem, logCtxParent, Logger } from '@gitlab-org/logging';
import { createFakePartial } from '@gitlab-org/test-utils';
import { AuthContext, SystemContext } from '@gitlab-org/request-context';
import { ErrorTracker } from './error_tracker';
import { DefaultErrorHandler, ErrorHandler } from './error_handler';
import { SanitizedError } from './sanitized_error';

describe('Error Handler', () => {
  const systemContextItem = logCtxItem('system', 'system-test');
  const authContextItem = logCtxItem('auth', 'auth-test');
  let errorHandler: ErrorHandler;
  const sentryTracker = createFakePartial<ErrorTracker>({
    trackError: jest.fn(),
    dispose: jest.fn(),
  });

  let contextLogger: Logger;
  let logger: Logger;

  beforeEach(() => {
    contextLogger = createFakePartial<Logger>({
      error: jest.fn(),
    });
    logger = createFakePartial<Logger>({
      withContext: jest.fn().mockReturnValue(contextLogger),
    });

    errorHandler = new DefaultErrorHandler(
      logger,
      sentryTracker,
      createFakePartial<SystemContext>(systemContextItem),
      createFakePartial<AuthContext>(authContextItem),
    );
  });

  it('handle trackable error', () => {
    const error = new SanitizedError('test error', new Error());
    errorHandler.handleError('test error', error);
    expect(sentryTracker.trackError).toHaveBeenCalledWith(error, undefined);
  });

  it('handle non trackable error', () => {
    const error = new Error();
    errorHandler.handleError('test error', error);
    expect(sentryTracker.trackError).not.toHaveBeenCalled();
  });

  it('logs context', () => {
    const error = new Error();
    errorHandler.handleError('test error', error);

    expect(logger.withContext).toHaveBeenCalledWith(
      logCtxParent('Server Context', systemContextItem, authContextItem),
    );

    expect(contextLogger.error).toHaveBeenCalledWith('test error', error);
  });

  it('unwraps sanitized error for local logs', () => {
    const innerError = new Error('test error');
    const error = new SanitizedError('sanitized message', innerError);

    errorHandler.handleError('problem', error);

    expect(contextLogger.error).toHaveBeenCalledWith(expect.any(String), innerError);
  });

  it('tracks additional data', () => {
    const error = new SanitizedError('test error', new Error());
    const additionalData = { correlationId: 'correlationId' };
    errorHandler.handleError('test error', error, additionalData);
    expect(sentryTracker.trackError).toHaveBeenCalledWith(error, additionalData);
  });

  describe('when disposed', () => {
    beforeEach(() => errorHandler.dispose?.());

    it('disposes error tracker', () => {
      expect(sentryTracker.dispose).toHaveBeenCalled();
    });
  });
});
