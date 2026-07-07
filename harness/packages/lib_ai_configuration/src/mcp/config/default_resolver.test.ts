import fs from 'fs/promises';
import { NullLogger, type Logger } from '@gitlab-org/logging';
import type { ServerName } from '../types';
import { DefaultMcpConfigResolver } from './default_resolver';
import type { Configuration } from './schema';
import type { McpConfigurationError } from './errors';

jest.mock('fs/promises');

// Helper for building strongly typed mcpServers in tests
function serverMap(
  entries: [ServerName, Configuration['mcpServers'][ServerName]][],
): Configuration['mcpServers'] {
  return Object.fromEntries(entries) as Configuration['mcpServers'];
}

describe('DefaultMcpConfigResolver', () => {
  const mockedReadFile = jest.mocked(fs.readFile);
  let resolver: DefaultMcpConfigResolver;

  const mockLogger = {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  };

  beforeEach(() => {
    resolver = new DefaultMcpConfigResolver(new NullLogger());
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  it('returns an empty merged config when no candidates are provided', async () => {
    const result = await resolver.loadAndMerge([]);

    expect(result.config.mcpServers).toEqual({});
    expect(result.diagnostics).toEqual({});
    expect(result.serversOrigin).toEqual({});
  });

  it('merges multiple configs, giving precedence to earlier candidates', async () => {
    const configA: Configuration = {
      mcpServers: serverMap([
        ['server1' as ServerName, { type: 'stdio', command: 'cmd1' }],
        ['server2' as ServerName, { type: 'stdio', command: 'cmdA2' }],
      ]),
    };

    const configB: Configuration = {
      mcpServers: serverMap([
        ['server2' as ServerName, { type: 'stdio', command: 'cmdB2' }],
        ['server3' as ServerName, { type: 'sse', url: new URL('http://example.com') }],
      ]),
    };

    mockedReadFile
      .mockResolvedValueOnce(JSON.stringify(configA))
      .mockResolvedValueOnce(JSON.stringify(configB));

    const pathA = '/configs/a.json';
    const pathB = '/configs/b.json';

    const result = await resolver.loadAndMerge([pathA, pathB]);

    expect(Object.keys(result.config.mcpServers)).toEqual(['server1', 'server2', 'server3']);
    expect(result.config.mcpServers['server2' as ServerName]).toEqual(
      configA.mcpServers['server2' as ServerName],
    );

    const origin = result.serversOrigin['server2' as ServerName];
    expect(origin.resolvedPath).toBe(pathA);
    expect(origin.paths).toEqual([pathA, pathB]);
    expect(origin.index).toBe(0);
    expect(origin.hash).toBeDefined();
    expect(origin.parseResult.success).toBe(true);

    expect(result.diagnostics[pathA].status).toBe('ok');
    expect(result.diagnostics[pathB].status).toBe('ok');
  });

  it('records errors from individual candidates but still merges the rest', async () => {
    const okConfig: Configuration = {
      mcpServers: serverMap([['liveServer' as ServerName, { type: 'stdio', command: 'echo' }]]),
    };

    mockedReadFile
      .mockResolvedValueOnce(JSON.stringify(okConfig)) // ok.json
      .mockRejectedValueOnce(Object.assign(new Error('ENOENT'), { code: 'ENOENT' })); // err.json

    const pathOk = '/configs/ok.json';
    const pathErr = '/configs/err.json';

    const result = await resolver.loadAndMerge([pathOk, pathErr]);

    expect(result.config.mcpServers).toHaveProperty('liveserver');
    expect(result.diagnostics[pathErr].status).toBe('error');

    if (result.diagnostics[pathErr].status === 'error') {
      expect((result.diagnostics[pathErr].error as McpConfigurationError).code).toBe(
        'MCP_CONFIGURATION_FILE_NOT_FOUND_ERROR',
      );
    }
  });

  it('records a JSON parse error in diagnostics', async () => {
    mockedReadFile.mockResolvedValueOnce('this is not json');

    const path = '/configs/bad.json';
    const result = await resolver.loadAndMerge([path]);

    expect(result.diagnostics[path].status).toBe('error');
    if (result.diagnostics[path].status === 'error') {
      expect(result.diagnostics[path].error.code).toBe('MCP_CONFIGURATION_FILE_JSON_PARSE_ERROR');
    }
  });

  it('records file-level validation error when basic shape is wrong', async () => {
    const invalidConfig = { mcpServers: 'not an object' }; // mcpServers must be an object
    mockedReadFile.mockResolvedValueOnce(JSON.stringify(invalidConfig));

    const path = '/configs/invalid.json';
    const result = await resolver.loadAndMerge([path]);

    // File-level validation fails
    expect(result.diagnostics[path].status).toBe('error');
    if (result.diagnostics[path].status === 'error') {
      expect(result.diagnostics[path].error.code).toBe('MCP_CONFIGURATION_FILE_VALIDATION_ERROR');
    }
  });

  it('records individual server validation errors', async () => {
    const invalidConfig = { mcpServers: { bad: {} } }; // missing type/command/url
    mockedReadFile.mockResolvedValueOnce(JSON.stringify(invalidConfig));

    const path = '/configs/invalid.json';
    const result = await resolver.loadAndMerge([path]);

    // File-level validation succeeds (basic shape is correct)
    expect(result.diagnostics[path].status).toBe('ok');

    // Server config validation fails
    const badServerOrigin = result.serversOrigin['bad' as ServerName];
    expect(badServerOrigin).toBeDefined();
    expect(badServerOrigin.parseResult.success).toBe(false);

    if (!badServerOrigin.parseResult.success) {
      expect(badServerOrigin.parseResult.error).toBeDefined();
      expect(badServerOrigin.parseResult.error.issues.length).toBeGreaterThan(0);
    }

    // Invalid server is not included in final config
    expect(result.config.mcpServers['bad' as ServerName]).toBeUndefined();
  });

  it('provides clear error messages for invalid server type', async () => {
    const resolverWithLogger = new DefaultMcpConfigResolver(mockLogger as unknown as Logger);

    const invalidConfig = {
      mcpServers: {
        badServer: {
          type: 'streamable-http', // invalid type
          url: 'http://example.com',
        },
      },
    };
    mockedReadFile.mockResolvedValueOnce(JSON.stringify(invalidConfig));

    const path = '/configs/invalid-type.json';
    await resolverWithLogger.loadAndMerge([path]);

    // Verify warning was logged with helpful message
    expect(mockLogger.warn).toHaveBeenCalled();
    const warnCall = mockLogger.warn.mock.calls[0][0];
    expect(warnCall).toContain('Server "badServer" has invalid config');
    expect(warnCall).toContain(
      'The "type" field is required and must be one of: "stdio", "sse", or "http"',
    );
  });

  it('provides clear error messages for missing type field', async () => {
    const resolverWithLogger = new DefaultMcpConfigResolver(mockLogger as unknown as Logger);

    const invalidConfig = {
      mcpServers: {
        noTypeServer: {
          command: 'echo', // missing type field
        },
      },
    };
    mockedReadFile.mockResolvedValueOnce(JSON.stringify(invalidConfig));

    const path = '/configs/missing-type.json';
    await resolverWithLogger.loadAndMerge([path]);

    // Verify warning was logged with helpful message
    expect(mockLogger.warn).toHaveBeenCalled();
    const warnCall = mockLogger.warn.mock.calls[0][0];
    expect(warnCall).toContain('noTypeServer');
    expect(warnCall).toContain('type');
    expect(warnCall).toContain('required');
  });

  it('does not show type hint for non-type validation errors', async () => {
    const resolverWithLogger = new DefaultMcpConfigResolver(mockLogger as unknown as Logger);

    const invalidConfig = {
      mcpServers: {
        invalidUrlServer: {
          type: 'sse',
          url: 'not-a-valid-url', // invalid URL format
        },
      },
    };
    mockedReadFile.mockResolvedValueOnce(JSON.stringify(invalidConfig));

    const path = '/configs/invalid-url.json';
    await resolverWithLogger.loadAndMerge([path]);

    // Verify warning was logged but WITHOUT the type hint
    expect(mockLogger.warn).toHaveBeenCalled();
    const warnCall = mockLogger.warn.mock.calls[0][0];
    expect(warnCall).toContain('invalidUrlServer');
    expect(warnCall).not.toContain('Hint:');
  });

  describe('JSONC support', () => {
    it('successfully parses JSON with single-line comments', async () => {
      const jsoncContent = `{
        // This is a comment
        "mcpServers": {
          "server1": {
            "type": "stdio",
            "command": "echo" // inline comment
          }
        }
      }`;

      mockedReadFile.mockResolvedValueOnce(jsoncContent);

      const filePath = '/configs/with-comments.json';
      const result = await resolver.loadAndMerge([filePath]);

      expect(result.diagnostics[filePath].status).toBe('ok');
      const servers = Object.entries(result.config.mcpServers);
      expect(servers).toHaveLength(1);
      const [key, server] = servers[0];
      expect(key).toBe('server1');
      expect('command' in server && server.command).toBe('echo');
    });

    it('successfully parses JSON with multi-line comments', async () => {
      const jsoncContent = `{
        /*
         * Multi-line comment
         * describing the configuration
         */
        "mcpServers": {
          "server1": {
            "type": "stdio",
            "command": "echo"
          }
        }
      }`;

      mockedReadFile.mockResolvedValueOnce(jsoncContent);

      const filePath = '/configs/with-multiline-comments.json';
      const result = await resolver.loadAndMerge([filePath]);

      expect(result.diagnostics[filePath].status).toBe('ok');
      const servers = Object.entries(result.config.mcpServers);
      expect(servers).toHaveLength(1);
      const [key, server] = servers[0];
      expect(key).toBe('server1');
      expect('command' in server && server.command).toBe('echo');
    });

    it('successfully parses JSON with trailing commas', async () => {
      const jsoncContent = `{
        "mcpServers": {
          "server1": {
            "type": "stdio",
            "command": "echo",
            "args": ["arg1", "arg2",], // trailing comma in array
          }, // trailing comma in object
        },
      }`;

      mockedReadFile.mockResolvedValueOnce(jsoncContent);

      const filePath = '/configs/with-trailing-commas.json';
      const result = await resolver.loadAndMerge([filePath]);

      expect(result.diagnostics[filePath].status).toBe('ok');
      const servers = Object.entries(result.config.mcpServers);
      expect(servers).toHaveLength(1);
      const [key, server] = servers[0];
      expect(key).toBe('server1');
      expect('command' in server && server.command).toBe('echo');
      expect('args' in server && server.args).toEqual(['arg1', 'arg2']);
    });

    it('maintains backward compatibility with standard JSON', async () => {
      const standardJson = `{
        "mcpServers": {
          "server1": {
            "type": "stdio",
            "command": "echo",
            "args": ["arg1", "arg2"]
          }
        }
      }`;

      mockedReadFile.mockResolvedValueOnce(standardJson);

      const filePath = '/configs/standard.json';
      const result = await resolver.loadAndMerge([filePath]);

      expect(result.diagnostics[filePath].status).toBe('ok');
      const servers = Object.entries(result.config.mcpServers);
      expect(servers).toHaveLength(1);
      const [key, server] = servers[0];
      expect(key).toBe('server1');
      expect('command' in server && server.command).toBe('echo');
      expect('args' in server && server.args).toEqual(['arg1', 'arg2']);
    });

    it('returns parse error for malformed JSONC', async () => {
      const malformedJsonc = `{
        "mcpServers": {
          "server1": {
            "type": "stdio",
            "command": "echo" // missing closing brace
        }
      }`;

      mockedReadFile.mockResolvedValueOnce(malformedJsonc);

      const filePath = '/configs/malformed.json';
      const result = await resolver.loadAndMerge([filePath]);

      expect(result.diagnostics[filePath].status).toBe('error');
      if (result.diagnostics[filePath].status === 'error') {
        expect(result.diagnostics[filePath].error.code).toBe(
          'MCP_CONFIGURATION_FILE_JSON_PARSE_ERROR',
        );
      }
    });

    it('successfully parses JSONC with mixed comment styles', async () => {
      const mixedCommentsContent = `{
        // Single-line comment at the top
        "mcpServers": {
          /* Multi-line comment before server */
          "server1": {
            "type": "stdio", // inline single-line
            "command": "echo", /* inline multi-line */
            "args": [
              "arg1", // comment in array
              "arg2"
            ]
          }
        }
        // Comment at the end
      }`;

      mockedReadFile.mockResolvedValueOnce(mixedCommentsContent);

      const filePath = '/configs/mixed-comments.json';
      const result = await resolver.loadAndMerge([filePath]);

      expect(result.diagnostics[filePath].status).toBe('ok');
      const servers = Object.entries(result.config.mcpServers);
      expect(servers).toHaveLength(1);
      const [key, server] = servers[0];
      expect(key).toBe('server1');
      expect('command' in server && server.command).toBe('echo');
      expect('args' in server && server.args).toEqual(['arg1', 'arg2']);
    });
  });
});
