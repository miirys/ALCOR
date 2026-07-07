import fastify from 'fastify';
import { Logger } from '@gitlab-org/logging';
import { createFakePartial } from '@gitlab-org/test-utils';
import { createFastifyHttpServer } from './create_fastify_http_server';

// Mock dependencies
jest.mock('fastify');

// Create mock implementations
const mockLogger = createFakePartial<Logger>({
  debug: jest.fn(),
  error: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
});

const mockServer = {
  register: jest.fn(),
  listen: jest.fn().mockImplementation((_options, callback) => {
    callback(null, 'http://localhost:3000/');
  }),
  close: jest.fn().mockResolvedValue(undefined),
  ready: jest.fn().mockResolvedValue(undefined),
};

(fastify as unknown as jest.Mock).mockReturnValue(mockServer);

describe('createFastifyHttpServer', () => {
  it('create and start the server successfully', async () => {
    // Arrange
    const port = 3000;

    // Act
    const result = await createFastifyHttpServer({ port, logger: mockLogger });

    // Assert
    expect(result.address.toString()).toBe('http://localhost:3000/');
    expect(result.shutdown).toBeInstanceOf(Function);
    expect(mockLogger.info).toHaveBeenCalledWith(
      '[HttpServer]: server listening on http://localhost:3000/',
      undefined,
    );
  });

  it('register plugins', async () => {
    // Arrange
    const port = 3000;
    const mockPlugin = jest.fn();
    const plugins = [{ plugin: mockPlugin, options: {} }];

    // Act
    await createFastifyHttpServer({ port, plugins, logger: mockLogger });

    // Assert
    expect(mockServer.register).toHaveBeenCalledWith(mockPlugin, {});
  });

  it('calls shutdown method successfully', async () => {
    // Arrange
    const port = 3000;

    // Act
    const { shutdown } = await createFastifyHttpServer({ port, logger: mockLogger });
    await shutdown();

    // Assert
    expect(mockServer.close).toHaveBeenCalled();
    expect(mockLogger.info).toHaveBeenCalledWith('[HttpServer]: server shutdown', undefined);
  });

  it('handles server setup error', async () => {
    // Arrange
    const port = 3000;
    mockServer.listen.mockImplementationOnce((_options, callback) => {
      callback(new Error('Server setup failed'), null);
    });

    // Act & Assert
    await expect(createFastifyHttpServer({ port, logger: mockLogger })).rejects.toThrow(
      'Server setup failed',
    );
  });

  it('handles server shutdown error', async () => {
    // Arrange
    const port = 3000;
    mockServer.close.mockRejectedValueOnce(new Error('Shutdown failed'));

    // Act
    const { shutdown } = await createFastifyHttpServer({ port, logger: mockLogger });
    await shutdown();

    // Assert
    expect(mockLogger.error).toHaveBeenCalledWith(
      '[HttpServer]: error during server shutdown',
      expect.any(Error),
    );
  });

  it('starts server on default port if port is not provided', async () => {
    // Arrange
    const defaultPort = 0;

    // Act
    await createFastifyHttpServer({ logger: mockLogger });

    // Assert
    expect(mockServer.listen).toHaveBeenCalledWith(
      { host: '127.0.0.1', port: defaultPort },
      expect.any(Function),
    );
  });
});
