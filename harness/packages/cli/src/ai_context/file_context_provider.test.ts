import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { URI } from 'vscode-uri';
import { TestLogger } from '@gitlab-org/logging';
import type { ConfigService, ClientConfig } from '@gitlab-org/config';
import type {
  RepositoryDiscoveryService,
  StatelessRepository,
  GitStatus,
} from '@gitlab-org/repositories';
import { createFakePartial } from '@gitlab-org/test-utils';
import type { FsClient } from '@gitlab-org/fs';
import {
  BINARY_FILE_DISABLED_REASON,
  type DuoChatAIRequest,
  type LocalFileAIContextItem,
} from '@gitlab-org/ai-context';
import type { ParsedCliInput } from '../parse';
import type { CliFileContextProvider } from './file_context_provider';

const mockIsBinaryFile = jest.fn<(uri: URI, fsClient: FsClient) => Promise<boolean>>();

jest.unstable_mockModule('@gitlab-org/fs', () => ({
  isBinaryFile: mockIsBinaryFile,
  FsClient: class {},
}));

const mockFilter = jest.fn<(candidates: string[], query: string, opts?: object) => string[]>();

jest.unstable_mockModule('fuzzaldrin-plus', () => ({
  filter: mockFilter,
}));

const { CliFileContextProvider: CliFileContextProviderClass } = await import(
  './file_context_provider'
);

describe('CliFileContextProvider', () => {
  let provider: CliFileContextProvider;
  let mockLogger: TestLogger;
  let mockDiscoveryService: RepositoryDiscoveryService;
  let mockCliInput: ParsedCliInput;
  let mockFsClient: FsClient;
  let mockConfigService: ConfigService;
  let mockRepository: StatelessRepository;
  let mockReadFile: jest.Mock<(path: string) => Promise<Buffer>>;
  let mockConfigGet: jest.Mock<(key?: string) => ClientConfig[keyof ClientConfig] | ClientConfig>;

  const testCwd = '/test/workspace';

  beforeEach(() => {
    jest.useFakeTimers();

    mockLogger = new TestLogger();

    mockRepository = createFakePartial<StatelessRepository>({
      fsPath: testCwd,
      getStatus: jest.fn<() => Promise<GitStatus>>(),
      getFiles: jest.fn<() => Promise<string[]>>(),
    });

    mockDiscoveryService = createFakePartial<RepositoryDiscoveryService>({
      getRepositoriesForWorkspaces:
        jest.fn<() => Promise<Map<StatelessRepository, { uri: string; name: string }>>>(),
    });

    mockCliInput = createFakePartial<ParsedCliInput>({
      cwd: testCwd,
    });

    mockReadFile = jest.fn<(path: string) => Promise<Buffer>>();

    mockFsClient = createFakePartial<FsClient>({
      promises: {
        readFile: mockReadFile as unknown as FsClient['promises']['readFile'],
        readFileFirstBytes: jest.fn() as unknown as FsClient['promises']['readFileFirstBytes'],
      },
    });

    mockConfigGet = jest.fn<(key?: string) => ClientConfig[keyof ClientConfig] | ClientConfig>();
    mockConfigService = createFakePartial<ConfigService>({
      get: mockConfigGet as ConfigService['get'],
    });

    provider = new CliFileContextProviderClass(
      mockLogger,
      mockDiscoveryService,
      mockCliInput,
      mockFsClient,
      mockConfigService,
    );

    mockIsBinaryFile.mockResolvedValue(false);
    mockFilter.mockImplementation((candidates) => candidates);
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  describe('searchContextItems', () => {
    describe('when query is empty', () => {
      const emptyQuery: DuoChatAIRequest = {
        category: 'file',
        query: '',
      };

      beforeEach(() => {
        const repoMap = new Map([
          [mockRepository, { uri: `file://${testCwd}`, name: 'workspace' }],
        ]);
        jest.mocked(mockDiscoveryService.getRepositoriesForWorkspaces).mockResolvedValue(repoMap);
      });

      it('should return modified files from git status', async () => {
        const mockStatus: GitStatus = {
          files: [
            { path: 'src/modified.ts', status: 'modified', staged: false },
            { path: 'src/added.ts', status: 'added', staged: true },
          ],
          branch: 'main',
          tracking: 'origin/main',
          ahead: 0,
          behind: 0,
          isClean: false,
        };
        jest.mocked(mockRepository.getStatus).mockResolvedValue(mockStatus);
        mockConfigGet.mockReturnValue('my-project');

        const results = await provider.searchContextItems(emptyQuery);

        expect(results).toHaveLength(2);
        expect(results[0].id).toBe('/test/workspace/src/modified.ts');
        expect(results[1].id).toBe('/test/workspace/src/added.ts');
      });

      it('should use cwd as workspace folder when no workspaceFolders provided', async () => {
        const mockStatus: GitStatus = {
          files: [],
          branch: 'main',
          tracking: null,
          ahead: 0,
          behind: 0,
          isClean: true,
        };
        jest.mocked(mockRepository.getStatus).mockResolvedValue(mockStatus);

        await provider.searchContextItems(emptyQuery);

        expect(mockDiscoveryService.getRepositoriesForWorkspaces).toHaveBeenCalledWith([
          { uri: `file://${testCwd}`, name: 'workspace' },
        ]);
      });

      it('should use provided workspaceFolders when available', async () => {
        const queryWithWorkspaces: DuoChatAIRequest = {
          category: 'file',
          query: '',
          workspaceFolders: [{ uri: 'file:///other/workspace', name: 'other' }],
        };
        const mockStatus: GitStatus = {
          files: [],
          branch: 'main',
          tracking: null,
          ahead: 0,
          behind: 0,
          isClean: true,
        };
        jest.mocked(mockRepository.getStatus).mockResolvedValue(mockStatus);

        await provider.searchContextItems(queryWithWorkspaces);

        expect(mockDiscoveryService.getRepositoriesForWorkspaces).toHaveBeenCalledWith([
          { uri: 'file:///other/workspace', name: 'other' },
        ]);
      });

      it('should limit results to MAX_RESULTS (10)', async () => {
        const manyFiles = Array.from({ length: 150 }, (_, i) => ({
          path: `file${i}.ts`,
          status: 'modified' as const,
          staged: false,
        }));
        const mockStatus: GitStatus = {
          files: manyFiles,
          branch: 'main',
          tracking: null,
          ahead: 0,
          behind: 0,
          isClean: false,
        };
        jest.mocked(mockRepository.getStatus).mockResolvedValue(mockStatus);
        mockConfigGet.mockReturnValue('project');

        const results = await provider.searchContextItems(emptyQuery);

        expect(results).toHaveLength(10);
      });

      it('should deduplicate files by absolute path across repositories', async () => {
        const workspaceFolder = { uri: `file://${testCwd}`, name: 'workspace' };
        const repo1 = createFakePartial<StatelessRepository>({
          fsPath: testCwd,
          getStatus: jest.fn<() => Promise<GitStatus>>().mockResolvedValue({
            files: [{ path: 'shared.ts', status: 'modified', staged: false }],
            branch: 'main',
            tracking: null,
            ahead: 0,
            behind: 0,
            isClean: false,
          }),
        });
        const repo2 = createFakePartial<StatelessRepository>({
          fsPath: testCwd,
          getStatus: jest.fn<() => Promise<GitStatus>>().mockResolvedValue({
            files: [{ path: 'shared.ts', status: 'added', staged: true }],
            branch: 'main',
            tracking: null,
            ahead: 0,
            behind: 0,
            isClean: false,
          }),
        });
        const repoMap = new Map([
          [repo1, workspaceFolder],
          [repo2, workspaceFolder],
        ]);
        jest.mocked(mockDiscoveryService.getRepositoriesForWorkspaces).mockResolvedValue(repoMap);
        mockConfigGet.mockReturnValue('project');

        const results = await provider.searchContextItems(emptyQuery);

        expect(results).toHaveLength(1);
      });
    });

    describe('when query is non-empty', () => {
      const searchQuery: DuoChatAIRequest = {
        category: 'file',
        query: 'test',
      };

      beforeEach(() => {
        const repoMap = new Map([
          [mockRepository, { uri: `file://${testCwd}`, name: 'workspace' }],
        ]);
        jest.mocked(mockDiscoveryService.getRepositoriesForWorkspaces).mockResolvedValue(repoMap);
        jest.mocked(mockRepository.getFiles).mockResolvedValue(['src/test.ts', 'src/other.ts']);
        mockConfigGet.mockReturnValue('my-project');
      });

      it('should search files using fuzzy filter', async () => {
        mockFilter.mockReturnValue(['/test/workspace/src/test.ts']);

        const resultPromise = provider.searchContextItems(searchQuery);
        await jest.runAllTimersAsync();
        const results = await resultPromise;

        expect(mockFilter).toHaveBeenCalledWith(
          expect.arrayContaining(['/test/workspace/src/test.ts', '/test/workspace/src/other.ts']),
          'test',
          { maxResults: 10 },
        );
        expect(results).toHaveLength(1);
        expect(results[0].id).toBe('/test/workspace/src/test.ts');
      });

      it('should handle repositories in subdirectories', async () => {
        const subRepo = createFakePartial<StatelessRepository>({
          fsPath: '/test/workspace/packages/sub',
          getFiles: jest.fn<() => Promise<string[]>>().mockResolvedValue(['index.ts']),
        });
        const repoMap = new Map([[subRepo, { uri: `file://${testCwd}`, name: 'workspace' }]]);
        jest.mocked(mockDiscoveryService.getRepositoriesForWorkspaces).mockResolvedValue(repoMap);
        mockFilter.mockImplementation((candidates) => candidates);

        const resultPromise = provider.searchContextItems(searchQuery);
        await jest.runAllTimersAsync();
        const results = await resultPromise;

        expect(results[0].metadata.relativePath).toBe('packages/sub/index.ts');
      });
    });

    describe('context item creation', () => {
      const query: DuoChatAIRequest = {
        category: 'file',
        query: '',
      };

      beforeEach(() => {
        const repoMap = new Map([
          [mockRepository, { uri: `file://${testCwd}`, name: 'workspace' }],
        ]);
        jest.mocked(mockDiscoveryService.getRepositoriesForWorkspaces).mockResolvedValue(repoMap);
        const mockStatus: GitStatus = {
          files: [{ path: 'src/file.ts', status: 'modified', staged: false }],
          branch: 'main',
          tracking: null,
          ahead: 0,
          behind: 0,
          isClean: false,
        };
        jest.mocked(mockRepository.getStatus).mockResolvedValue(mockStatus);
      });

      it('should create context item with correct metadata', async () => {
        mockConfigGet.mockReturnValue('my/project');

        const results = await provider.searchContextItems(query);

        expect(results[0]).toMatchObject({
          id: '/test/workspace/src/file.ts',
          category: 'file',
          metadata: {
            title: 'src/file.ts',
            enabled: true,
            icon: 'document',
            secondaryText: '@src/file.ts',
            subType: 'local_file_search',
            subTypeLabel: 'Project file',
            relativePath: 'src/file.ts',
            project: 'my/project',
          },
        });
      });

      it('should mark binary files as disabled', async () => {
        mockIsBinaryFile.mockResolvedValue(true);
        mockConfigGet.mockReturnValue('project');

        const results = await provider.searchContextItems(query);

        expect(results[0].metadata.enabled).toBe(false);
        expect(results[0].metadata.disabledReasons).toContain(BINARY_FILE_DISABLED_REASON);
      });

      it('should use default project text when projectPath not configured', async () => {
        mockConfigGet.mockReturnValue(undefined);

        const results = await provider.searchContextItems(query);

        expect(results[0].metadata.project).toBe('not a GitLab project');
      });

      it('should include workspaceFolder in metadata', async () => {
        mockConfigGet.mockReturnValue('project');

        const results = await provider.searchContextItems(query);

        expect(results[0].metadata.workspaceFolder).toEqual({
          uri: URI.file(testCwd).toString(),
          name: 'workspace',
        });
      });

      it('should quote secondaryText reference for paths with whitespace', async () => {
        const mockStatus: GitStatus = {
          files: [{ path: 'src/my file.ts', status: 'modified', staged: false }],
          branch: 'main',
          tracking: null,
          ahead: 0,
          behind: 0,
          isClean: false,
        };
        jest.mocked(mockRepository.getStatus).mockResolvedValue(mockStatus);
        mockConfigGet.mockReturnValue('project');

        const results = await provider.searchContextItems(query);

        expect(results[0].metadata.secondaryText).toBe('@"src/my file.ts"');
      });
    });
  });

  describe('retrieveContextItemsWithContent', () => {
    it('should return selected items with their content', async () => {
      const mockContent = 'file content here';
      mockReadFile.mockResolvedValue(Buffer.from(mockContent));

      const contextItem: LocalFileAIContextItem = {
        id: '/test/file.ts',
        category: 'file',
        metadata: {
          title: 'file.ts',
          enabled: true,
          icon: 'document',
          secondaryText: '@file.ts',
          subType: 'local_file_search',
          subTypeLabel: 'Project file',
          relativePath: 'file.ts',
          project: 'project',
        },
      };

      await provider.addSelectedContextItem(contextItem);
      const results = await provider.retrieveContextItemsWithContent();

      expect(results).toHaveLength(1);
      expect(results[0].content).toBe(mockContent);
    });
  });

  describe('getItemWithContent', () => {
    it('should read file content and return item with content', async () => {
      const mockContent = 'const x = 1;';
      mockReadFile.mockResolvedValue(Buffer.from(mockContent));

      const item: LocalFileAIContextItem = {
        id: '/test/workspace/src/file.ts',
        category: 'file',
        metadata: {
          title: 'file.ts',
          enabled: true,
          icon: 'document',
          secondaryText: '@src/file.ts',
          subType: 'local_file_search',
          subTypeLabel: 'Project file',
          relativePath: 'src/file.ts',
          project: 'project',
        },
      };

      const result = await provider.getItemWithContent(item);

      expect(mockReadFile).toHaveBeenCalledWith('/test/workspace/src/file.ts');
      expect(result.content).toBe(mockContent);
      expect(result.id).toBe(item.id);
    });
  });
});
