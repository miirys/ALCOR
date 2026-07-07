import { URI } from 'vscode-uri';
import { WorkspaceFolder } from 'vscode-languageserver-types';
import { createFakePartial } from '@gitlab-org/test-utils';
import { RepositoryService } from '@gitlab-org/repositories';
import { EmptyFsClient } from '../../services/fs/fs';
import { log } from '../../log';
import {
  DefaultFilePolicyProvider,
  DefaultPolicy,
  PolicyConfig,
  DisabledReason,
} from './file_policy';

jest.mock('../../services/fs');
jest.mock('../../log');

describe('DefaultFilePolicyProvider', () => {
  let policyProvider: DefaultFilePolicyProvider;
  let mockRepositoryService: RepositoryService;
  let mockFsClient: EmptyFsClient;
  let readFileMock = jest.fn();

  const createProvider = () => {
    mockRepositoryService = createFakePartial<RepositoryService>({
      onWorkspaceRepositoriesFinished: jest.fn(),
    });

    mockFsClient = createFakePartial<EmptyFsClient>({
      promises: createFakePartial<EmptyFsClient['promises']>({
        readFile: readFileMock,
      }),
    });

    policyProvider = new DefaultFilePolicyProvider(mockRepositoryService, mockFsClient);
    return policyProvider;
  };

  const workspaceFolder = {
    name: 'workspace1',
    uri: 'file:///path/to/workspace1',
  };

  beforeEach(() => {
    createProvider();
  });

  describe('onWorkspaceRepositoriesSet', () => {
    beforeEach(() => {
      jest.spyOn(policyProvider, 'init').mockResolvedValue();
    });

    it('initializes the context provider only when the workspace folder is set', async () => {
      expect(policyProvider.init).not.toHaveBeenCalled();
      const onWorkspaceRepositoriesSetCallback = jest.mocked(
        mockRepositoryService.onWorkspaceRepositoriesFinished,
      ).mock.calls[0][0];
      onWorkspaceRepositoriesSetCallback(workspaceFolder);
      expect(policyProvider.init).toHaveBeenCalledTimes(1);
      expect(policyProvider.init).toHaveBeenCalledWith(workspaceFolder);
    });
  });

  describe('init', () => {
    it('attempts to read the `.ai-context-policy.yml` file', async () => {
      readFileMock = jest.fn().mockResolvedValue(JSON.stringify(DefaultPolicy));
      createProvider();
      await policyProvider.init(workspaceFolder);

      expect(mockFsClient.promises.readFile).toHaveBeenCalledWith(
        URI.parse('/path/to/workspace1/.ai-context-policy.yml').fsPath,
        'utf8',
      );
    });

    it('does not read the configuration if there is no workspace folder', async () => {
      await policyProvider.init(undefined as unknown as WorkspaceFolder);
      expect(readFileMock).not.toHaveBeenCalled();
    });

    it('does not fail if the file does not exist, but logs', async () => {
      const error = new Error('File does not exist') as NodeJS.ErrnoException;
      error.code = 'ENOENT';
      readFileMock = jest.fn().mockRejectedValue(error);
      createProvider();

      await expect(() => policyProvider.init(workspaceFolder)).not.toThrow();
      expect(log.info).toHaveBeenCalledWith(
        '[File Policy] .ai-context-policy.yml file was not found, using default policy',
      );
    });

    it('does not fail if the file cannot be read, but logs', async () => {
      readFileMock = jest.fn().mockRejectedValue(new Error('foo'));
      createProvider();

      await expect(() => policyProvider.init(workspaceFolder)).not.toThrow();
      expect(log.error).toHaveBeenCalledWith(
        '[File Policy] Error while reading .ai-context-policy.yml: Error: foo',
      );
    });

    it('logs error if the supplied policy type is not supported', async () => {
      const policy = {
        ai_context_policy: 'foo',
        exclude: [],
      } as unknown as PolicyConfig;
      readFileMock = jest.fn().mockResolvedValue(JSON.stringify(policy));
      createProvider();
      await policyProvider.init(workspaceFolder);

      expect(log.error).toHaveBeenCalledWith('[File Policy] Invalid policy type: foo');
    });
  });

  describe('isContextItemAllowed', () => {
    it.each([
      ['dist/file.js', { enabled: true }],
      ['.env', { enabled: true }],
      ['file.md', { enabled: true }],
      ['file.js', { enabled: true }],
      ['src/main.js', { enabled: true }],
      ['src/deep/in/code/main.js', { enabled: true }],
      ['src/deep/in/code/main.ts', { enabled: true }],
      ['src/main.ts', { enabled: true }],
      [undefined, { enabled: false, disabledReasons: ['File not found'] }],
      ['', { enabled: false, disabledReasons: ['File not found'] }],
    ])('checks if %s is allowed by default', async (filePath, expectation) => {
      expect(await policyProvider.isContextItemAllowed(filePath)).toEqual(expectation);
    });

    describe('with .ai-context-policy.yml', () => {
      describe('custom "allow" policy', () => {
        const customAllowPolicy = {
          ai_context_policy: 'allow',
          exclude: ['.env', '*.md', 'src/main.js', 'src/deep/in/code/main.js'],
        } as PolicyConfig;

        beforeEach(async () => {
          readFileMock = jest.fn().mockResolvedValue(JSON.stringify(customAllowPolicy));
          createProvider();
          await policyProvider.init(workspaceFolder);
        });

        it.each([
          ['dist/file.js', { enabled: true }],
          ['.env', { enabled: false, disabledReasons: [DisabledReason] }],
          ['file.md', { enabled: false, disabledReasons: [DisabledReason] }],
          ['file.js', { enabled: true }],
          ['src/main.js', { enabled: false, disabledReasons: [DisabledReason] }],
          ['src/deep/in/code/main.js', { enabled: false, disabledReasons: [DisabledReason] }],
          ['src/deep/in/code/main.ts', { enabled: true }],
          ['src/main.ts', { enabled: true }],
          [undefined, { enabled: false, disabledReasons: ['File not found'] }],
          ['', { enabled: false, disabledReasons: ['File not found'] }],
        ])('returns correct allowance for %s', async (filePath, expectation) => {
          expect(await policyProvider.isContextItemAllowed(filePath)).toEqual(expectation);
        });
      });

      describe('custom "block" policy', () => {
        const customBlockPolicy = {
          ai_context_policy: 'block',
          exclude: ['src/**/*', '*.md'],
        } as PolicyConfig;

        beforeEach(async () => {
          readFileMock = jest.fn().mockResolvedValue(JSON.stringify(customBlockPolicy));
          createProvider();
          await policyProvider.init(workspaceFolder);
        });

        it.each([
          ['dist/file.js', { enabled: false, disabledReasons: [DisabledReason] }],
          ['.env', { enabled: false, disabledReasons: [DisabledReason] }],
          ['file.md', { enabled: true }],
          ['file.js', { enabled: false, disabledReasons: [DisabledReason] }],
          ['src/main.js', { enabled: true }],
          ['src/deep/in/code/main.js', { enabled: true }],
          ['src/deep/in/code/main.ts', { enabled: true }],
          ['src/main.ts', { enabled: true }],
          [undefined, { enabled: false, disabledReasons: ['File not found'] }],
          ['', { enabled: false, disabledReasons: ['File not found'] }],
        ])('returns correct allowance for %s', async (filePath, expectation) => {
          expect(await policyProvider.isContextItemAllowed(filePath)).toEqual(expectation);
        });
      });
    });
  });
});
