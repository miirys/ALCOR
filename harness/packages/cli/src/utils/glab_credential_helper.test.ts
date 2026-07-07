import type { spawnSync as spawnSyncType } from 'child_process';
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { DefaultLogger } from '@gitlab-org/logging';

const mockSpawnSync = jest.fn<typeof spawnSyncType>();

jest.unstable_mockModule('child_process', () => ({
  spawnSync: mockSpawnSync,
}));

const { getGlabCredentials } = await import('./glab_credential_helper');

describe('getGlabCredentials', () => {
  let mockLogger: DefaultLogger;

  beforeEach(() => {
    mockSpawnSync.mockReset();
    mockLogger = {
      debug: jest.fn(),
      error: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
    } as unknown as DefaultLogger;
  });

  it('should return credential when glab credential-helper succeeds', async () => {
    const mockOutput = JSON.stringify({
      type: 'success',
      token: { type: 'pat', token: 'glpat-test-token-12345' },
      instance_url: 'https://gitlab.com',
    });
    mockSpawnSync.mockReturnValue({
      status: 0,
      stdout: mockOutput,
      stderr: '',
    } as unknown as ReturnType<typeof spawnSyncType>);

    const credential = await getGlabCredentials(mockLogger, '/test/cwd');

    expect(credential).toEqual({
      type: 'pat',
      token: 'glpat-test-token-12345',
      instanceUrl: 'https://gitlab.com',
    });
    expect(mockSpawnSync).toHaveBeenCalledWith(
      'glab',
      ['auth', 'credential-helper'],
      expect.objectContaining({
        encoding: 'utf-8',
        timeout: 10000,
        cwd: '/test/cwd',
      }),
    );
    expect(mockLogger.info).toHaveBeenCalledWith(
      'Attempting to fetch credentials from glab credential-helper',
    );
    expect(mockLogger.info).toHaveBeenCalledWith(
      'Successfully retrieved credentials from glab credential-helper',
    );
  });

  it('should return oauth credential with expiresAt for oauth2 tokens', async () => {
    const mockOutput = JSON.stringify({
      type: 'success',
      token: { type: 'oauth2', token: 'oauth-token-123', expiry_timestamp: '2026-03-01T00:00:00Z' },
      instance_url: 'https://gitlab.com',
    });
    mockSpawnSync.mockReturnValue({
      status: 0,
      stdout: mockOutput,
      stderr: '',
    } as unknown as ReturnType<typeof spawnSyncType>);

    const credential = await getGlabCredentials(mockLogger, '/test/cwd');

    expect(credential).toEqual({
      type: 'oauth',
      token: 'oauth-token-123',
      expiresAt: new Date('2026-03-01T00:00:00Z'),
      instanceUrl: 'https://gitlab.com',
    });
  });

  it('should treat job-token as pat with a warning', async () => {
    const mockOutput = JSON.stringify({
      type: 'success',
      token: { type: 'job-token', token: 'job-token-456' },
      instance_url: 'https://gitlab.com',
    });
    mockSpawnSync.mockReturnValue({
      status: 0,
      stdout: mockOutput,
      stderr: '',
    } as unknown as ReturnType<typeof spawnSyncType>);

    const credential = await getGlabCredentials(mockLogger, '/test/cwd');

    expect(credential).toEqual({
      type: 'pat',
      token: 'job-token-456',
      instanceUrl: 'https://gitlab.com',
    });
    expect(mockLogger.warn).toHaveBeenCalledWith(
      'glab returned job-token credential type, treating as pat',
    );
  });

  it('should return null when glab credential-helper returns empty output', async () => {
    mockSpawnSync.mockReturnValue({
      status: 0,
      stdout: '',
      stderr: '',
    } as unknown as ReturnType<typeof spawnSyncType>);

    const token = await getGlabCredentials(mockLogger, '/test/cwd');

    expect(token).toBeNull();
    expect(mockLogger.warn).toHaveBeenCalledWith('glab credential-helper returned empty response');
  });

  it('should return null when glab credential-helper does not return a token', async () => {
    const mockOutput = '{"type":"pat"}';
    mockSpawnSync.mockReturnValue({
      status: 0,
      stdout: mockOutput,
      stderr: '',
    } as unknown as ReturnType<typeof spawnSyncType>);

    const token = await getGlabCredentials(mockLogger, '/test/cwd');

    expect(token).toBeNull();
    expect(mockLogger.warn).toHaveBeenCalledWith(
      'glab credential-helper returned unparseable response',
    );
  });

  it('should return null when glab returns error message', async () => {
    const mockOutput = JSON.stringify({
      type: 'error',
      message: 'unable to determine token',
    });
    mockSpawnSync.mockReturnValue({
      status: 0,
      stdout: mockOutput,
      stderr: '',
    } as unknown as ReturnType<typeof spawnSyncType>);

    const token = await getGlabCredentials(mockLogger, '/test/cwd');

    expect(token).toBeNull();
    expect(mockLogger.info).toHaveBeenCalledWith(
      'glab credential-helper returned error: unable to determine token',
    );
  });

  describe('when glab is not installed', () => {
    it('should return null with ENOENT error', async () => {
      const enoentError = Object.assign(new Error('spawn glab ENOENT'), {
        code: 'ENOENT',
        errno: -2,
        syscall: 'spawnSync glab',
        path: 'glab',
      });
      mockSpawnSync.mockReturnValue({
        status: null,
        stdout: undefined,
        stderr: undefined,
        error: enoentError,
      } as unknown as ReturnType<typeof spawnSyncType>);

      const token = await getGlabCredentials(mockLogger, '/test/cwd');

      expect(token).toBeNull();
      expect(mockLogger.info).toHaveBeenCalledWith('glab is not installed or not found in PATH');
    });

    it('should return null when spawnSync throws', async () => {
      mockSpawnSync.mockImplementation(() => {
        throw new Error('glab: command not found');
      });

      const token = await getGlabCredentials(mockLogger, '/test/cwd');

      expect(token).toBeNull();
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Failed to get credentials from glab credential-helper:',
        expect.any(Error),
      );
    });
  });

  it('should handle custom GitLab URLs', async () => {
    const mockOutput = JSON.stringify({
      type: 'success',
      token: { type: 'pat', token: 'glpat-custom-token' },
      instance_url: 'https://gitlab.example.com',
    });
    mockSpawnSync.mockReturnValue({
      status: 0,
      stdout: mockOutput,
      stderr: '',
    } as unknown as ReturnType<typeof spawnSyncType>);

    const credential = await getGlabCredentials(mockLogger, '/test/cwd');

    expect(credential).toEqual({
      type: 'pat',
      token: 'glpat-custom-token',
      instanceUrl: 'https://gitlab.example.com',
    });
    expect(mockSpawnSync).toHaveBeenCalledWith(
      'glab',
      ['auth', 'credential-helper'],
      expect.objectContaining({
        encoding: 'utf-8',
        cwd: '/test/cwd',
      }),
    );
  });

  it('should handle JSON output with extra whitespace', async () => {
    const mockOutput = `  ${JSON.stringify({
      type: 'success',
      token: { type: 'pat', token: 'glpat-test-token' },
      instance_url: 'https://gitlab.com',
    })}  \n`;
    mockSpawnSync.mockReturnValue({
      status: 0,
      stdout: mockOutput,
      stderr: '',
    } as unknown as ReturnType<typeof spawnSyncType>);

    const credential = await getGlabCredentials(mockLogger, '/test/cwd');

    expect(credential).toEqual({
      type: 'pat',
      token: 'glpat-test-token',
      instanceUrl: 'https://gitlab.com',
    });
  });

  describe('when glab version does not support credential-helper', () => {
    it('should return null and log that the command is not available', async () => {
      // Older glab versions print help text to stdout and exit 0
      // when credential-helper subcommand doesn't exist
      const helpOutput = `  Manage glab's authentication state.

  USAGE

    glab auth <command> [command] [--flags]

  COMMANDS

    login [--flags]     Authenticate with a GitLab instance.
    logout [--flags]    Logout from a GitLab instance.
    status [--flags]    View authentication status.

  FLAGS

    -h --help           Show help for this command.
`;
      mockSpawnSync.mockReturnValue({
        status: 0,
        stdout: helpOutput,
        stderr: '',
      } as unknown as ReturnType<typeof spawnSyncType>);

      const token = await getGlabCredentials(mockLogger, '/test/cwd');

      expect(token).toBeNull();
      expect(mockLogger.info).toHaveBeenCalledWith(
        'glab credential-helper command not available (glab version may be too old, run `glab --version` to check — requires 1.85.2 or higher)',
      );
    });
  });

  it('should handle malformed JSON gracefully', async () => {
    const mockOutput = 'not valid json';
    mockSpawnSync.mockReturnValue({
      status: 0,
      stdout: mockOutput,
      stderr: '',
    } as unknown as ReturnType<typeof spawnSyncType>);

    const token = await getGlabCredentials(mockLogger, '/test/cwd');

    expect(token).toBeNull();
    expect(mockLogger.warn).toHaveBeenCalledWith(
      'glab credential-helper returned unparseable response',
    );
  });
});
