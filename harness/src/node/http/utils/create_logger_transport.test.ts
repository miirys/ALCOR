import { Logger } from '@gitlab-org/logging';
import { createFakePartial } from '@gitlab-org/test-utils';
import { createLoggerTransport } from './create_logger_transport';

describe('createLoggerTransport', () => {
  let mockLogger: Logger;

  beforeEach(() => {
    mockLogger = createFakePartial<Logger>({
      debug: jest.fn(),
      error: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
    });
  });

  it('should call callback after logging', (done) => {
    // Arrange
    const transport = createLoggerTransport(mockLogger, 'debug');

    // Act
    const callback = jest.fn(() => {
      // Assert
      expect(callback).toHaveBeenCalled();
      done();
    });
    transport.write('test log', 'utf-8', callback);
  });

  it('should write logs to the provided logger', (done) => {
    // Arrange
    const transport = createLoggerTransport(mockLogger);

    // Act
    transport.write('test log', 'utf-8', () => {
      expect(mockLogger.debug).toHaveBeenCalledWith('test log');
      done();
    });
  });
});
