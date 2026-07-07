import { spawn } from 'node:child_process';
import { writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { v4 as uuidv4 } from 'uuid';
import * as git from 'isomorphic-git';
import { FsClient } from '@gitlab-org/fs';
import { TestLogger } from '@gitlab-org/logging';
import { ConfigService } from '@gitlab-org/config';
import { SecretRedactor } from '@gitlab-org/secret-redaction';
import { createFakePartial, MockChildProcess } from '@gitlab-org/test-utils';
import { NodeGitLsFiles } from './ls_files.node';

jest.mock('node:child_process');
jest.mock('node:fs/promises');
jest.mock('node:os', () => ({
  ...jest.requireActual('node:os'),
  tmpdir: jest.fn(),
}));
jest.mock('uuid');
jest.mock('isomorphic-git');

describe('NodeGitLsFiles', () => {
  let command: NodeGitLsFiles;
  let mockLogger: TestLogger;
  let mockChildProcess: MockChildProcess;
  let mockFsClient: FsClient;
  let mockConfigService: ConfigService;
  let mockSecretRedactor: SecretRedactor;
  const repositoryUrl = 'https://gitlab.example.com/group/project.git';
  const basePath = '/path/to/repository';
  const gitPassword = 'secret-token';

  const simulateSuccessfulExecution = () => {
    setImmediate(() => {
      mockChildProcess.stdout.emit('data', 'file1.txt\nfile2.txt');
      mockChildProcess.emit('close', 0);
    });
  };

  beforeEach(() => {
    mockLogger = new TestLogger();
    mockChildProcess = new MockChildProcess();
    mockFsClient = createFakePartial<FsClient>({});
    mockConfigService = createFakePartial<ConfigService>({
      get: jest.fn(),
    });
    mockSecretRedactor = createFakePartial<SecretRedactor>({
      redactSecrets: jest.fn((input: string) => input),
    });

    command = new NodeGitLsFiles(mockLogger, mockConfigService, mockFsClient, mockSecretRedactor);

    jest.mocked(tmpdir).mockReturnValue('/tmp');
    jest.mocked(writeFile).mockResolvedValue(undefined);
    jest.mocked(rm).mockResolvedValue(undefined);
    jest.mocked(uuidv4).mockReturnValue('mock-uuid');
  });

  describe('execute', () => {
    describe('when repository supports isomorphic-git operation', () => {
      beforeEach(() => {
        jest.mocked(git.listFiles).mockResolvedValue(['src/foo.ts']);
      });

      it('uses isomorphic-git instead of system git', async () => {
        const result = await command.execute(basePath, repositoryUrl, gitPassword);

        expect(result).toEqual(['src/foo.ts']);
        expect(spawn).not.toHaveBeenCalled();
      });
    });

    describe('when repository does not support isomorphic-git', () => {
      beforeEach(() => {
        jest
          .mocked(git.listFiles)
          .mockRejectedValue(new Error('something something dircache version unsupported oh no'));
      });

      it('calls spawn with correct arguments', async () => {
        jest.mocked(spawn).mockReturnValue(mockChildProcess as unknown as ReturnType<typeof spawn>);

        const executePromise = command.execute(basePath, repositoryUrl, gitPassword);

        simulateSuccessfulExecution();
        await executePromise;

        expect(spawn).toHaveBeenCalledWith(
          'git',
          expect.arrayContaining(['ls-files']),
          expect.any(Object),
        );
      });
    });
  });
});
