import { logCtxItem } from '../log_context';
import { Logger, LogMethod } from '../types';
import { withPrefix } from './with_prefix';

describe('withPrefix', () => {
  let mockLogger: Logger;
  let contextLogger: Logger;
  const prefix = '[TestPrefix]';

  beforeEach(() => {
    contextLogger = {
      debug: jest.fn(),
      error: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      withContext: jest.fn(),
    };
    mockLogger = {
      debug: jest.fn(),
      error: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      withContext: jest.fn().mockReturnValue(contextLogger),
    };
  });

  const testCases: {
    method: LogMethod;
    message: string;
    error?: Error;
  }[] = [
    { method: 'debug', message: 'debug message' },
    { method: 'error', message: 'error message' },
    { method: 'info', message: 'info message' },
    { method: 'warn', message: 'warn message' },
    { method: 'error', message: 'error message with error', error: new Error('An error occurred') },
  ];

  testCases.forEach(({ method, message, error }) => {
    it(`should prefix ${method} messages${error ? ' with an error' : ''}`, () => {
      // Arrange
      const prefixedLogger = withPrefix(mockLogger, prefix);

      // Act
      if (error) {
        prefixedLogger[method](message, error);
      } else {
        prefixedLogger[method](message);
      }

      // Assert
      if (error) {
        expect(mockLogger[method]).toHaveBeenCalledWith(`${prefix} ${message}`, error);
      } else {
        expect(mockLogger[method]).toHaveBeenCalledWith(`${prefix} ${message}`, undefined);
      }
    });
  });

  it('should prefix errorCtx message', () => {
    const prefixedLogger = withPrefix(mockLogger, prefix);
    const testCtx = logCtxItem('name', 'value');
    const testError = new Error('test error');

    prefixedLogger.withContext(testCtx).error('test message', testError);

    expect(mockLogger.withContext).toHaveBeenCalledWith(testCtx);
    expect(contextLogger.error).toHaveBeenCalledWith(`${prefix} test message`, testError);
  });
});
