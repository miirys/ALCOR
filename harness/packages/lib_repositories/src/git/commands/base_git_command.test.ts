import { spawn } from 'node:child_process';
import { writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { v4 as uuidv4 } from 'uuid';
import { TestLogger } from '@gitlab-org/logging';
import { MockChildProcess, createFakePartial } from '@gitlab-org/test-utils';
import { ConfigService } from '@gitlab-org/config';
import { SecretRedactor } from '@gitlab-org/secret-redaction';
import { BaseGitCommand, GitCommandResult } from './base_git_command';

jest.mock('node:child_process');
jest.mock('node:fs/promises');
jest.mock('node:os', () => ({
  ...jest.requireActual('node:os'),
  tmpdir: jest.fn(),
}));
jest.mock('uuid');

// Create a concrete implementation of the abstract BaseGitCommand for testing
class TestGitCommand extends BaseGitCommand {
  // Expose protected methods for testing
  exposedBuildGitArgs(
    command: string,
    commandArgs: string[],
    repositoryUrl: string,
    basePath: string,
  ): Promise<string[]> {
    return this.buildGitArgs(command, commandArgs, repositoryUrl, basePath);
  }

  exposedDefaultGitArgs(repositoryUrl: string, basePath: string): Promise<string[]> {
    return this.defaultGitArgs(repositoryUrl, basePath);
  }

  exposedExtractBaseURL(url: string): string {
    return this.extractBaseURL(url);
  }

  exposedCreateGitAskPass(): Promise<string> {
    return this.createGitAskPass();
  }

  exposedRemoveGitAskPass(tempFilePath: string): Promise<void> {
    return this.removeGitAskPass(tempFilePath);
  }

  exposedRunGitCommand(
    gitArgs: string[],
    basePath: string,
    gitPassword: string,
  ): Promise<GitCommandResult> {
    return this.runGitCommand(gitArgs, basePath, gitPassword);
  }
}

describe('BaseGitCommand', () => {
  let gitCommand: TestGitCommand;
  let mockLogger: TestLogger;
  let mockConfigService: ConfigService;
  let mockSecretRedactor: SecretRedactor;
  const workspaceFolderPath = '/path/to/folder';
  const mockUuid = '12345678-1234-1234-1234-123456789012';
  let mockChildProcess: MockChildProcess;

  beforeEach(() => {
    mockLogger = new TestLogger();
    mockConfigService = createFakePartial<ConfigService>({
      get: jest.fn().mockReturnValue(undefined),
    });
    mockSecretRedactor = createFakePartial<SecretRedactor>({
      redactSecrets: jest.fn((input: string) => input),
    });

    gitCommand = new TestGitCommand(mockLogger, mockConfigService, mockSecretRedactor);

    jest.mocked(tmpdir).mockReturnValue('/tmp');
    jest.mocked(writeFile).mockResolvedValue(undefined);
    jest.mocked(rm).mockResolvedValue(undefined);

    jest.mocked(uuidv4).mockReturnValue(mockUuid);

    mockChildProcess = new MockChildProcess();
    jest.mocked(spawn).mockReturnValue(mockChildProcess as unknown as ReturnType<typeof spawn>);
  });

  describe('buildGitArgs', () => {
    it('builds git args with command args', async () => {
      const command = 'status';
      const commandArgs = ['--short'];
      const repositoryUrl = 'https://gitlab.example.com/group/project.git';

      const result = await gitCommand.exposedBuildGitArgs(
        command,
        commandArgs,
        repositoryUrl,
        workspaceFolderPath,
      );

      expect(result).toContain('status');
      expect(result).toContain('--short');
      // Verify it has default args too
      expect(result.some((arg) => arg.includes('safe.directory'))).toBe(true);
    });

    it('builds git args with empty command args', async () => {
      const command = 'status';
      const commandArgs: string[] = [];
      const repositoryUrl = 'https://gitlab.example.com/group/project.git';

      const result = await gitCommand.exposedBuildGitArgs(
        command,
        commandArgs,
        repositoryUrl,
        workspaceFolderPath,
      );

      expect(result).toContain('status');
      // Verify default args are included
      expect(result.some((arg) => arg.includes('credential.'))).toBe(true);
    });
  });

  describe('defaultGitArgs', () => {
    it('generates default git args with repository URL', async () => {
      // Remove this env var if it exists (which it will when running these tests on CI)
      const originalEnv = process.env.CI_REPOSITORY_URL;
      delete process.env.CI_REPOSITORY_URL;

      const repositoryUrl = 'https://gitlab.example.com/group/project.git';

      const result = await gitCommand.exposedDefaultGitArgs(repositoryUrl, workspaceFolderPath);

      expect(result).toContain(`safe.directory=${workspaceFolderPath}`);
      expect(result.some((arg) => arg.includes('credential'))).toBe(true);
      expect(result.some((arg) => arg.includes('user.email'))).toBe(true);
      expect(
        result.some((arg) =>
          arg.includes('url.https://gitlab.example.com/.insteadOf=git@gitlab.example.com:'),
        ),
      ).toBe(true);

      if (originalEnv !== undefined) {
        process.env.CI_REPOSITORY_URL = originalEnv;
      }
    });

    it('generates default git args with blank repository URL', async () => {
      const repositoryUrl = '';

      const result = await gitCommand.exposedDefaultGitArgs(repositoryUrl, workspaceFolderPath);

      expect(result).toContain(`safe.directory=${workspaceFolderPath}`);
      expect(result.some((arg) => arg.includes('user.email'))).toBe(true);
      expect(result.some((arg) => arg.match(/credential\..*\.username=/))).toBe(false);
      expect(result.some((arg) => arg.match(/url\..*\.insteadOf=/))).toBe(false);
    });

    it('throws error if gitHTTPBaseURL is invalid', async () => {
      const repositoryUrl = 'invalid-url';

      await expect(
        gitCommand.exposedDefaultGitArgs(repositoryUrl, workspaceFolderPath),
      ).rejects.toThrow();
    });

    describe('git http user', () => {
      const repositoryUrl = 'https://gitlab.example.com/group/project.git';

      describe('when ConfigService has no git http user', () => {
        beforeEach(() => {
          jest.mocked(mockConfigService.get).mockReturnValue(undefined);
        });

        it('uses default auth user', async () => {
          const result = await gitCommand.exposedDefaultGitArgs(repositoryUrl, workspaceFolderPath);

          expect(
            result.some(
              (arg) => arg.includes('credential.helper=') && arg.includes('username=auth'),
            ),
          ).toBe(true);
        });
      });

      describe('when ConfigService has a git http user', () => {
        const configUser = 'config-user';

        beforeEach(() => {
          const mockGet = mockConfigService.get as jest.Mock;
          mockGet.mockImplementation((key: string) => {
            if (key === 'gitHttpUser') return configUser;
            return undefined;
          });
        });

        it('uses user from configuration instead of default', async () => {
          const result = await gitCommand.exposedDefaultGitArgs(repositoryUrl, workspaceFolderPath);

          expect(
            result.some(
              (arg) => arg.includes('credential.helper=') && arg.includes('username=config-user'),
            ),
          ).toBe(true);
        });
      });
    });

    describe('CI_REPOSITORY_URL handling', () => {
      const repositoryUrl = 'https://gitlab.com/group/project.git';
      let originalEnv: NodeJS.ProcessEnv;

      beforeEach(() => {
        originalEnv = process.env;
      });

      afterEach(() => {
        process.env = originalEnv;
      });

      describe('when CI_REPOSITORY_URL is set', () => {
        beforeEach(() => {
          process.env = {
            ...originalEnv,
            CI_REPOSITORY_URL: 'http://gitlab-ci-token:foo-token-bar@gdk.test:3000/project.git',
          };
        });

        it('uses CI repository URL for insteadOf rewriting', async () => {
          const result = await gitCommand.exposedDefaultGitArgs(repositoryUrl, workspaceFolderPath);

          expect(
            result.some((arg) =>
              arg.includes(
                'url.https://gitlab.com/.insteadOf=http://gitlab-ci-token:foo-token-bar@gdk.test:3000',
              ),
            ),
          ).toBe(true);
        });
      });

      describe('when CI_REPOSITORY_URL is not set', () => {
        beforeEach(() => {
          process.env = { ...originalEnv };
          delete process.env.CI_REPOSITORY_URL;
        });

        it('uses SSH rewriting rule', async () => {
          const result = await gitCommand.exposedDefaultGitArgs(repositoryUrl, workspaceFolderPath);

          expect(
            result.some((arg) => arg.includes('url.https://gitlab.com/.insteadOf=git@gitlab.com:')),
          ).toBe(true);
        });
      });

      describe('when CI_REPOSITORY_URL is malformed', () => {
        beforeEach(() => {
          process.env = {
            ...originalEnv,
            CI_REPOSITORY_URL: 'not-a-valid-url',
          };
        });

        it('throws an error', async () => {
          await expect(
            gitCommand.exposedDefaultGitArgs(repositoryUrl, workspaceFolderPath),
          ).rejects.toThrow('Failed to parse CI_REPOSITORY_URL');
        });
      });
    });

    describe('git user name', () => {
      const repositoryUrl = 'https://gitlab.example.com/group/project.git';

      describe('when ConfigService has no git user name', () => {
        beforeEach(() => {
          jest.mocked(mockConfigService.get).mockReturnValue(undefined);
        });

        it('does not include user.name configuration', async () => {
          const result = await gitCommand.exposedDefaultGitArgs(repositoryUrl, workspaceFolderPath);

          expect(result.some((arg) => arg.includes('user.name='))).toBe(false);
        });
      });

      describe('when ConfigService has a git user name', () => {
        const configUserName = 'Duo Developer';

        beforeEach(() => {
          const mockGet = mockConfigService.get as jest.Mock;
          mockGet.mockImplementation((key: string) => {
            if (key === 'gitUserName') return configUserName;
            return undefined;
          });
        });

        it('includes user.name configuration from ConfigService', async () => {
          const result = await gitCommand.exposedDefaultGitArgs(repositoryUrl, workspaceFolderPath);

          expect(result.some((arg) => arg.includes('user.name=Duo Developer'))).toBe(true);
        });
      });
    });

    describe('git user email', () => {
      const repositoryUrl = 'https://gitlab.example.com/group/project.git';

      describe('when ConfigService has no git user email', () => {
        beforeEach(() => {
          jest.mocked(mockConfigService.get).mockReturnValue(undefined);
        });

        it('includes user.email configuration with empty value', async () => {
          const result = await gitCommand.exposedDefaultGitArgs(repositoryUrl, workspaceFolderPath);

          expect(result.some((arg) => arg === 'user.email=')).toBe(true);
        });
      });

      describe('when ConfigService has a git user email', () => {
        const configUserEmail = 'duo-developer@gitlab.com';

        beforeEach(() => {
          const mockGet = mockConfigService.get as jest.Mock;
          mockGet.mockImplementation((key: string) => {
            if (key === 'gitUserEmail') return configUserEmail;
            return undefined;
          });
        });

        it('includes user.email configuration from ConfigService', async () => {
          const result = await gitCommand.exposedDefaultGitArgs(repositoryUrl, workspaceFolderPath);

          expect(result.some((arg) => arg.includes('user.email=duo-developer@gitlab.com'))).toBe(
            true,
          );
        });
      });
    });
  });

  describe('extractBaseURL', () => {
    it.each([
      ['https://gitlab.example.com/group/project.git', 'https://gitlab.example.com'],
      ['http://example.org:8080/group/repo.git', 'http://example.org:8080'],
      ['https://subdomain.example.com/path?query=1', 'https://subdomain.example.com'],
      // SSH URL formats that should be converted to HTTP
      [
        'git@gitlab.com:gitlab-org/modelops/applied-ml/code-suggestions/ai-assist.git',
        'https://gitlab.com',
      ],
      ['git@example.com:user/repo.git', 'https://example.com'],
      ['ssh://git@gitlab.com/user/repo.git', 'https://gitlab.com'],
      ['git://gitlab.com/user/repo.git', 'https://gitlab.com'],
    ])('extracts base URL from %s correctly', (input, expected) => {
      expect(gitCommand.exposedExtractBaseURL(input)).toBe(expected);
    });

    it.each([
      ['not-a-url', 'invalid URL'],
      ['example.com/no-protocol', 'invalid URL'],
      ['ftp://example.com/repo.git', 'unsupported protocol: ftp:'],
    ])('throws error for invalid URL %s', (input, expectedError) => {
      try {
        gitCommand.exposedExtractBaseURL(input);
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'unexpected error';
        expect(message).toContain(expectedError);
      }
    });
  });

  describe('createGitAskPass', () => {
    it('creates a temporary askpass script file', async () => {
      const expectedTempPath = join('/tmp', `git-askpass-${mockUuid}`);

      const result = await gitCommand.exposedCreateGitAskPass();

      expect(result).toBe(expectedTempPath);
      expect(writeFile).toHaveBeenCalledWith(expectedTempPath, '#!/bin/sh\necho $GIT_PASSWORD', {
        mode: 0o700,
      });
    });
  });

  describe('removeGitAskPass', () => {
    it('removes the temporary askpass script file', async () => {
      const tempFilePath = join('/tmp', `git-askpass-${mockUuid}`);

      await gitCommand.exposedRemoveGitAskPass(tempFilePath);

      expect(rm).toHaveBeenCalledWith(tempFilePath, { force: true });
    });

    it('logs a warning but does not throw if cleanup fails', async () => {
      const tempFilePath = join('/tmp', `git-askpass-${mockUuid}`);
      const cleanupError = new Error('Permission denied');

      mockLogger.warn = jest.fn();
      jest.mocked(rm).mockRejectedValue(cleanupError);

      await gitCommand.exposedRemoveGitAskPass(tempFilePath);

      expect(rm).toHaveBeenCalledWith(tempFilePath, { force: true });
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Failed to clean up temporary git askpass file'),
        cleanupError,
      );
    });
  });

  describe('runGitCommand', () => {
    const gitArgs = ['status', '--short'];
    const gitPassword = 'secret-token';

    it('executes the command with correct arguments and environment', async () => {
      const executePromise = gitCommand.exposedRunGitCommand(
        gitArgs,
        workspaceFolderPath,
        gitPassword,
      );

      // Verify the spawn call
      expect(spawn).toHaveBeenCalledWith(
        'git',
        gitArgs,
        expect.objectContaining({
          cwd: workspaceFolderPath,
          shell: false,
          env: expect.objectContaining({
            GIT_PASSWORD: gitPassword,
            GIT_CONFIG_NOSYSTEM: '1',
            GIT_CONFIG_NOGLOBAL: '1',
            GIT_CONFIG_GLOBAL: '/dev/null',
            http_proxy: undefined,
            https_proxy: undefined,
            all_proxy: undefined,
            no_proxy: undefined,
          }),
        }),
      );

      // Complete the execution
      mockChildProcess.stdout.emit('data', 'command output');
      mockChildProcess.emit('close', 0);

      const result = await executePromise;
      expect(result).toEqual({ output: 'command output', exitCode: 0 });
    });

    it('passes through expected process env vars', async () => {
      const originalEnv = { ...process.env };

      process.env = {
        HOME: '/home/mock',
        PATH: 'foo;bar;baz',
        GIT_EXEC_PATH: '/home/mock/git/execs',
        SECRET_VALUE: 'frogs r neat',
        http_proxy: 'http://proxy.example.com:8080',
        https_proxy: 'http://proxy.example.com:8080',
        all_proxy: 'proxy.example.com:8080',
        no_proxy: 'localhost,127.0.0.1,::1',
      };

      const executePromise = gitCommand.exposedRunGitCommand(
        gitArgs,
        workspaceFolderPath,
        gitPassword,
      );

      const { env } = jest.mocked(spawn).mock.calls[0][2];

      expect(env?.HOME).toEqual('/home/mock');
      expect(env?.PATH).toEqual('foo;bar;baz');
      expect(env?.GIT_EXEC_PATH).toEqual('/home/mock/git/execs');
      expect(env?.SECRET_VALUE).toBeUndefined();
      expect(env?.http_proxy).toEqual('http://proxy.example.com:8080');
      expect(env?.https_proxy).toEqual('http://proxy.example.com:8080');
      expect(env?.all_proxy).toEqual('proxy.example.com:8080');
      expect(env?.no_proxy).toEqual('localhost,127.0.0.1,::1');
      expect(env?.DUO_WORKFLOW_GIT_USER_EMAIL).toBeUndefined();
      expect(env?.DUO_WORKFLOW_GIT_USER_NAME).toBeUndefined();
      expect(env?.DUO_WORKFLOW_GIT_AUTHOR_EMAIL).toBeUndefined();
      expect(env?.DUO_WORKFLOW_GIT_AUTHOR_USER_NAME).toBeUndefined();

      expect(Object.keys(env || {})).toHaveLength(16); // includes the other non process.env vars we set

      // Complete the execution
      mockChildProcess.stdout.emit('data', 'command output');
      mockChildProcess.emit('close', 0);

      const result = await executePromise;
      expect(result).toEqual({ output: 'command output', exitCode: 0 });

      process.env = originalEnv;
    });

    it('combines stdout and stderr output', async () => {
      const executePromise = gitCommand.exposedRunGitCommand(
        gitArgs,
        workspaceFolderPath,
        gitPassword,
      );

      mockChildProcess.stdout.emit('data', 'stdout data');
      mockChildProcess.stderr.emit('data', 'stderr data');
      mockChildProcess.emit('close', 0);

      const result = await executePromise;
      expect(result).toEqual({ output: 'stdout datastderr data', exitCode: 0 });
    });

    it('resolves with exit code when command returns non-zero exit code', async () => {
      const executePromise = gitCommand.exposedRunGitCommand(
        gitArgs,
        workspaceFolderPath,
        gitPassword,
      );

      mockChildProcess.stdout.emit('data', 'some output');
      mockChildProcess.stderr.emit('data', 'error: fatal');
      mockChildProcess.emit('close', 1);

      const result = await executePromise;
      expect(result).toEqual({ output: 'some outputerror: fatal', exitCode: 1 });
    });

    it('rejects when process.spawn throws an error', async () => {
      const executePromise = gitCommand.exposedRunGitCommand(
        gitArgs,
        workspaceFolderPath,
        gitPassword,
      );

      const error = new Error('Process error');
      mockChildProcess.emit('error', error);

      await expect(executePromise).rejects.toThrow('Process error');
    });

    describe('git http password', () => {
      let executePromise: Promise<GitCommandResult>;

      afterEach(async () => {
        mockChildProcess.stdout.emit('data', 'success');
        mockChildProcess.emit('close', 0);

        await executePromise;
      });

      describe('when ConfigService has no git http password', () => {
        beforeEach(() => {
          jest.mocked(mockConfigService.get).mockReturnValue(undefined);
        });

        it('uses provided git http password parameter', async () => {
          const parameterPassword = 'parameter-password';

          executePromise = gitCommand.exposedRunGitCommand(
            gitArgs,
            workspaceFolderPath,
            parameterPassword,
          );

          expect(spawn).toHaveBeenCalledWith(
            'git',
            gitArgs,
            expect.objectContaining({
              env: expect.objectContaining({
                GIT_PASSWORD: parameterPassword,
              }),
            }),
          );
        });
      });
      describe('when ConfigService has a git http password', () => {
        const configPassword = 'config-password';

        beforeEach(() => {
          const mockGet = mockConfigService.get as jest.Mock;
          mockGet.mockImplementation((key: string) => {
            if (key === 'gitHttpPassword') return configPassword;
            return undefined;
          });
        });

        it('uses prefers password from configuration instead of provided parameter', async () => {
          const parameterPassword = 'parameter-password';

          executePromise = gitCommand.exposedRunGitCommand(
            gitArgs,
            workspaceFolderPath,
            parameterPassword,
          );

          expect(spawn).toHaveBeenCalledWith(
            'git',
            gitArgs,
            expect.objectContaining({
              env: expect.objectContaining({
                GIT_PASSWORD: configPassword,
              }),
            }),
          );
        });
      });
    });
  });
});
