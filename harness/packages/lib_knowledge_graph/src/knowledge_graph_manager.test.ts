import { spawn } from 'child_process';
import { getDuoConfigFilePath } from '@gitlab-org/ai-configuration';
import { Logger } from '@gitlab-org/logging';
import { createFakePartial } from '@gitlab-org/test-utils';
import { IKnowledgeGraphConfig } from '@gitlab-org/config';
import { DefaultKnowledgeGraphManager } from './knowledge_graph_manager';
import { LocalKnowledgeGraphClient } from './knowledge_graph_client';

jest.mock('child_process');
jest.mock('./knowledge_graph_client');
jest.mock('@gitlab-org/ai-configuration', () => ({
  getDuoConfigFilePath: jest.fn(),
}));

describe('DefaultKnowledgeGraphManager', () => {
  let manager: DefaultKnowledgeGraphManager;
  let logger: Logger;
  let mockGetDuoConfigFilePath: jest.MockedFunction<typeof getDuoConfigFilePath>;
  let mockChildProcess: {
    stdout: {
      on: jest.Mock;
      read: jest.Mock;
    };
    stderr: {
      on: jest.Mock;
      read: jest.Mock;
    };
    on: jest.Mock;
  };

  beforeEach(() => {
    logger = createFakePartial<Logger>({
      warn: jest.fn(),
      error: jest.fn(),
      info: jest.fn(),
      debug: jest.fn(),
    });

    mockChildProcess = {
      stdout: {
        on: jest.fn(),
        read: jest.fn(),
      },
      stderr: {
        on: jest.fn(),
        read: jest.fn(),
      },
      on: jest.fn(),
    };

    mockGetDuoConfigFilePath = getDuoConfigFilePath as jest.MockedFunction<
      typeof getDuoConfigFilePath
    >;
    mockGetDuoConfigFilePath.mockReturnValue(undefined);

    (spawn as jest.Mock).mockReturnValue(mockChildProcess);

    manager = new DefaultKnowledgeGraphManager(logger);
  });

  describe('startServer', () => {
    beforeEach(() => {
      mockChildProcess.on.mockImplementation(() => {});
    });

    it('should spawn gkg server process without MCP when no config path', async () => {
      mockGetDuoConfigFilePath.mockReturnValue(undefined);
      mockChildProcess.stdout.on.mockImplementation(
        (event: string, callback: (data: unknown) => void) => {
          if (event === 'data') {
            callback(JSON.stringify({ port: 8080 }));
          }
        },
      );

      await manager.startServer({});

      expect(mockGetDuoConfigFilePath).toHaveBeenCalledWith('mcp.json');
      expect(spawn).toHaveBeenCalledWith('gkg', ['server', 'start'], { detached: true });
    });

    it('should spawn gkg server process with MCP registration when config path exists', async () => {
      mockGetDuoConfigFilePath.mockReturnValue('/path/to/mcp.json');
      mockChildProcess.stdout.on.mockImplementation(
        (event: string, callback: (data: unknown) => void) => {
          if (event === 'data') {
            callback(JSON.stringify({ port: 9090 }));
          }
        },
      );

      await manager.startServer({});

      expect(mockGetDuoConfigFilePath).toHaveBeenCalledWith('mcp.json');
      expect(spawn).toHaveBeenCalledWith(
        'gkg',
        ['server', 'start', '--register-mcp', '/path/to/mcp.json'],
        { detached: true },
      );
    });

    it('should use custom binary path when provided', async () => {
      const config: IKnowledgeGraphConfig = {
        binaryPath: '/custom/path/gkg',
      };

      mockChildProcess.stdout.on.mockImplementation(
        (event: string, callback: (data: unknown) => void) => {
          if (event === 'data') {
            callback(JSON.stringify({ port: 8080 }));
          }
        },
      );

      await manager.startServer(config);

      expect(spawn).toHaveBeenCalledWith('/custom/path/gkg', ['server', 'start'], {
        detached: true,
      });
    });

    it('should use custom binary path with MCP registration when config path exists', async () => {
      const config: IKnowledgeGraphConfig = {
        binaryPath: '/custom/path/gkg',
      };

      mockGetDuoConfigFilePath.mockReturnValue('/path/to/mcp.json');
      mockChildProcess.stdout.on.mockImplementation(
        (event: string, callback: (data: unknown) => void) => {
          if (event === 'data') {
            callback(JSON.stringify({ port: 9090 }));
          }
        },
      );

      await manager.startServer(config);

      expect(spawn).toHaveBeenCalledWith(
        '/custom/path/gkg',
        ['server', 'start', '--register-mcp', '/path/to/mcp.json'],
        { detached: true },
      );
    });

    it('should handle Buffer data', async () => {
      mockChildProcess.stdout.on.mockImplementation(
        (event: string, callback: (data: unknown) => void) => {
          if (event === 'data') {
            callback(Buffer.from(JSON.stringify({ port: 9000 })));
          }
        },
      );

      const started = await manager.startServer({});

      expect(started).toBe(true);
      expect(manager.getUrl()?.toString()).toBe('http://localhost:9000/');
    });

    it('should handle server port data', async () => {
      mockChildProcess.stdout.on.mockImplementation(
        (event: string, callback: (data: unknown) => void) => {
          if (event === 'data') {
            callback(JSON.stringify({ port: 7000 }));
          }
        },
      );

      const started = await manager.startServer({});

      expect(started).toBe(true);
      expect(manager.getUrl()?.toString()).toBe('http://localhost:7000/');
    });

    it('should not start server if already running', async () => {
      mockChildProcess.stdout.on.mockImplementation(
        (event: string, callback: (data: unknown) => void) => {
          if (event === 'data') {
            callback(JSON.stringify({ port: 8080 }));
          }
        },
      );

      // Start the server
      const firstStart = await manager.startServer({});
      expect(firstStart).toBe(true);
      expect(manager.getUrl()?.toString()).toBe('http://localhost:8080/');

      (spawn as jest.Mock).mockClear();

      // Starting again should not spawn a new process
      const secondStart = await manager.startServer({});
      expect(secondStart).toBe(true);
      expect(spawn).not.toHaveBeenCalled();
      expect(manager.getUrl()?.toString()).toBe('http://localhost:8080/');
    });

    describe('server output parsing errors', () => {
      beforeEach(() => {
        mockChildProcess.on.mockImplementation(() => {});
      });

      it('should reject when the output is not a valid JSON object', async () => {
        mockChildProcess.stdout.on.mockImplementation(
          (event: string, callback: (data: unknown) => void) => {
            if (event === 'data') {
              callback('invalid json');
            }
          },
        );

        await expect(manager.startServer({})).rejects.toThrow();
      });

      it('should reject when the port is missing', async () => {
        mockChildProcess.stdout.on.mockImplementation(
          (event: string, callback: (data: unknown) => void) => {
            if (event === 'data') {
              callback(JSON.stringify({ otherField: 'value' }));
            }
          },
        );

        await expect(manager.startServer({})).rejects.toThrow();
      });

      it('should reject when the port is not a number', async () => {
        mockChildProcess.stdout.on.mockImplementation(
          (event: string, callback: (data: unknown) => void) => {
            if (event === 'data') {
              callback(JSON.stringify({ port: 'not-a-number' }));
            }
          },
        );

        await expect(manager.startServer({})).rejects.toThrow();
      });
    });

    describe('process errors', () => {
      it('should reject when spawn fails', async () => {
        const spawnError = new Error('Command not found');
        mockChildProcess.on.mockImplementation(
          (event: string, callback: (data: unknown) => void) => {
            if (event === 'error') {
              callback(spawnError);
            }
          },
        );

        await expect(manager.startServer({})).rejects.toThrow('Command not found');
      });

      it('should not have started when gkg binary is not found (ENOENT)', async () => {
        const enoentError = new Error('spawn gkg ENOENT');
        Object.defineProperty(enoentError, 'code', { value: 'ENOENT' });

        mockChildProcess.on.mockImplementation(
          (event: string, callback: (data: unknown) => void) => {
            if (event === 'error') {
              callback(enoentError);
            }
          },
        );

        const result = await manager.startServer({});

        expect(result).toBe(false);
      });

      it('should reject when process exits with non-zero code', async () => {
        mockChildProcess.on.mockImplementation(
          (event: string, callback: (data: unknown) => void) => {
            if (event === 'exit') {
              callback(1);
            }
          },
        );

        await expect(manager.startServer({})).rejects.toThrow(
          'Knowledge Graph server exited with code 1.',
        );
      });
    });
  });

  describe('getClient', () => {
    describe('when server is not started', () => {
      it('should return undefined', () => {
        const client = manager.getClient();

        expect(client).toBeUndefined();
      });
    });

    describe('when server is started', () => {
      beforeEach(async () => {
        mockChildProcess.stdout.on.mockImplementation(
          (event: string, callback: (data: unknown) => void) => {
            if (event === 'data') {
              callback(JSON.stringify({ port: 8080 }));
            }
          },
        );

        mockChildProcess.on.mockImplementation(() => {});

        await manager.startServer({});
      });

      it('should create client', () => {
        const client = manager.getClient();

        expect(client).toBeInstanceOf(LocalKnowledgeGraphClient);
      });
    });
  });

  describe('onServerStarted', () => {
    it('should call multiple listeners when server starts', async () => {
      mockChildProcess.stdout.on.mockImplementation(
        (event: string, callback: (data: unknown) => void) => {
          if (event === 'data') {
            callback(JSON.stringify({ port: 8080 }));
          }
        },
      );
      mockChildProcess.on.mockImplementation(() => {});

      const listener1 = jest.fn();
      const listener2 = jest.fn();
      manager.onServerStarted(listener1);
      manager.onServerStarted(listener2);

      await manager.startServer({});

      const expectedEvent = { url: manager.getUrl() };
      expect(listener1).toHaveBeenCalledWith(expectedEvent);
      expect(listener2).toHaveBeenCalledWith(expectedEvent);
    });
  });
});
