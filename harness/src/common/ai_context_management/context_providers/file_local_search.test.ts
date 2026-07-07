import path from 'node:path';
import { WorkspaceFolder } from 'vscode-languageserver-protocol';
import { URI } from 'vscode-uri';
import fuzzaldrinPlus from 'fuzzaldrin-plus';
import { createFakePartial } from '@gitlab-org/test-utils';
import { BINARY_FILE_DISABLED_REASON, type LocalFileAIContextItem } from '@gitlab-org/ai-context';
import { RepositoryFile, RepositoryService } from '@gitlab-org/repositories';
import { Logger, TestLogger } from '@gitlab-org/logging';
import { FsClient } from '../../services/fs/fs';
import { createMockFsClient } from '../../services/fs/fs.test_utils';
import { DuoProjectAccessChecker } from '../../services/duo_access';
import { DuoProjectStatus } from '../../services/duo_access/project_access_checker';
import { isBinaryFile } from '../../utils/binary_content';
import { FilePolicyProvider } from '../context_policies/file_policy';
import { DuoExclusionFilePolicyProvider } from '../context_policies/duo_exclusion_file_policy';
import { DefaultLocalFileContextProvider } from './file_local_search';

jest.mock('../../services/git/repository_service');
jest.mock('../../services/duo_access');
jest.mock('../../services/fs');
jest.mock('fuzzaldrin-plus');
jest.mock('../../utils/binary_content', () => ({
  isBinaryFile: jest.fn().mockResolvedValue(false),
}));

describe('DefaultLocalsFileContextProvider', () => {
  let provider: DefaultLocalFileContextProvider;
  let mockRepositoryService: RepositoryService;
  let mockProjectAccessChecker: DuoProjectAccessChecker;
  let mockFsClient: FsClient;
  let mockFilePolicyProvider: FilePolicyProvider;
  let mockDuoExclusionFilePolicyProvider: DuoExclusionFilePolicyProvider;
  let logger: Logger;

  beforeEach(() => {
    jest.useFakeTimers();
    logger = new TestLogger();
    mockRepositoryService = createFakePartial<RepositoryService>({
      getCurrentFilesForWorkspace: jest.fn(),
    });
    mockProjectAccessChecker = createFakePartial<DuoProjectAccessChecker>({
      checkProjectStatus: jest.fn(),
    });
    mockFsClient = createMockFsClient();
    mockFilePolicyProvider = createFakePartial<FilePolicyProvider>({
      isContextItemAllowed: jest.fn().mockResolvedValue({ enabled: true }),
    });
    mockDuoExclusionFilePolicyProvider = createFakePartial<DuoExclusionFilePolicyProvider>({
      isContextItemAllowed: jest.fn().mockResolvedValue({ enabled: true }),
    });

    provider = new DefaultLocalFileContextProvider(
      logger,
      mockRepositoryService,
      mockProjectAccessChecker,
      mockFsClient,
      mockFilePolicyProvider,
      mockDuoExclusionFilePolicyProvider,
    );
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  describe('searchContextItems', () => {
    const mockWorkspaceFolder: WorkspaceFolder = {
      uri: 'file:///workspace',
      name: 'workspace',
    };

    const mockFiles: RepositoryFile[] = [
      {
        uri: URI.parse('file:///workspace/file1.ts'),
        workspaceFolder: mockWorkspaceFolder,
        isIgnored: false,
        repositoryUri: URI.parse('file:///workspace/file1.ts'),
        dirUri: () => URI.parse('file:///workspace'),
      },
      {
        uri: URI.parse('file:///workspace/file2.ts'),
        workspaceFolder: mockWorkspaceFolder,
        isIgnored: false,
        repositoryUri: URI.parse('file:///workspace/file2.ts'),
        dirUri: () => URI.parse('file:///workspace'),
      },
    ];

    beforeEach(() => {
      jest.mocked(mockRepositoryService.getCurrentFilesForWorkspace).mockReturnValue(mockFiles);
      jest.mocked(mockProjectAccessChecker.checkProjectStatus).mockReturnValue({
        status: DuoProjectStatus.DuoEnabled,
        project: {
          namespaceWithPath: 'group/project',
          host: 'gitlab.com',
          namespace: 'group',
          projectPath: 'project',
          enabled: true,
          uri: 'file:///workspace/file1.ts',
          exclusionRules: [],
          remoteName: 'origin',
        },
      });
    });

    it('should return an empty array for an empty query', async () => {
      const result = await provider.searchContextItems({
        query: '',
        workspaceFolders: [],
        category: 'file',
      });
      expect(result).toEqual([]);
    });

    it('should return filtered results for a non-empty query', async () => {
      jest.mocked(fuzzaldrinPlus.filter).mockReturnValue(mockFiles.map((file) => file.uri.fsPath));
      const resultPromise = provider.searchContextItems({
        query: 'file',
        workspaceFolders: [mockWorkspaceFolder],
        category: 'file',
      });

      await jest.runAllTimersAsync();
      const result = await resultPromise;

      expect(result.length).toBe(2);
      expect(result[0].id).toBe('file:///workspace/file1.ts');
      expect(result[1].id).toBe('file:///workspace/file2.ts');
    });

    it('should handle disabled projects correctly', async () => {
      jest.mocked(fuzzaldrinPlus.filter).mockReturnValue(mockFiles.map((file) => file.uri.fsPath));
      jest.mocked(mockProjectAccessChecker.checkProjectStatus).mockReturnValueOnce({
        status: DuoProjectStatus.DuoDisabled,
        project: {
          namespaceWithPath: 'group/project',
          host: 'gitlab.com',
          namespace: 'group',
          projectPath: 'project',
          enabled: false,
          uri: 'file:///workspace/file1.ts',
          exclusionRules: [],
          remoteName: 'origin',
        },
      });

      const resultPromise = provider.searchContextItems({
        query: 'file',
        workspaceFolders: [mockWorkspaceFolder],
        category: 'file',
      });

      await jest.runAllTimersAsync();

      const result = await resultPromise;

      expect(result[0].metadata.enabled).toBe(false);
      expect(result[0].metadata.disabledReasons).toEqual(['project disabled']);
    });

    it('should handle non-GitLab projects correctly', async () => {
      jest.mocked(mockProjectAccessChecker.checkProjectStatus).mockReturnValueOnce({
        status: DuoProjectStatus.NonGitlabProject,
        project: undefined,
      });

      const resultPromise = provider.searchContextItems({
        query: 'file',
        workspaceFolders: [mockWorkspaceFolder],
        category: 'file',
      });

      await jest.runAllTimersAsync();

      const result = await resultPromise;

      expect(result[0].metadata.project).toBe('not a GitLab project');
    });

    it.each([
      ['binary file', true, false, [BINARY_FILE_DISABLED_REASON]],
      ['text file', false, true, []],
    ])('correctly handles %s', async (_, isBinary, shouldBeEnabled, expectedReasons) => {
      jest.mocked(isBinaryFile).mockResolvedValueOnce(isBinary);

      const resultPromise = provider.searchContextItems({
        query: 'file',
        workspaceFolders: [mockWorkspaceFolder],
        category: 'file',
      });

      await jest.runAllTimersAsync();

      const result = await resultPromise;

      expect(result[0].metadata.enabled).toBe(shouldBeEnabled);
      expect(result[0].metadata.disabledReasons).toEqual(expectedReasons);
      expect(isBinaryFile).toHaveBeenCalledWith(
        expect.objectContaining({ scheme: 'file' }),
        mockFsClient,
      );
    });

    it('combines disabled reasons from multiple sources', async () => {
      jest.mocked(isBinaryFile).mockResolvedValueOnce(true);
      jest.mocked(mockProjectAccessChecker.checkProjectStatus).mockReturnValue({
        status: DuoProjectStatus.DuoDisabled,
      });

      const resultPromise = provider.searchContextItems({
        query: 'file',
        workspaceFolders: [mockWorkspaceFolder],
        category: 'file',
      });

      await jest.runAllTimersAsync();

      const result = await resultPromise;

      expect(result[0].metadata.enabled).toBe(false);
      expect(result[0].metadata.disabledReasons).toEqual(
        expect.arrayContaining([BINARY_FILE_DISABLED_REASON, 'project disabled']),
      );
    });

    it('calls policy providers to check file allowance', async () => {
      jest.mocked(fuzzaldrinPlus.filter).mockReturnValue(mockFiles.map((file) => file.uri.fsPath));

      const resultPromise = provider.searchContextItems({
        query: 'file',
        workspaceFolders: [mockWorkspaceFolder],
        category: 'file',
      });

      await jest.runAllTimersAsync();
      await resultPromise;

      expect(mockFilePolicyProvider.isContextItemAllowed).toHaveBeenCalledWith('file1.ts');
      expect(mockFilePolicyProvider.isContextItemAllowed).toHaveBeenCalledWith('file2.ts');
      expect(mockDuoExclusionFilePolicyProvider.isContextItemAllowed).toHaveBeenCalledWith(
        'file1.ts',
      );
      expect(mockDuoExclusionFilePolicyProvider.isContextItemAllowed).toHaveBeenCalledWith(
        'file2.ts',
      );
    });

    it('disables item if FilePolicyProvider disables it', async () => {
      jest.mocked(fuzzaldrinPlus.filter).mockReturnValue([mockFiles[0].uri.fsPath]);
      mockFilePolicyProvider.isContextItemAllowed = jest.fn().mockResolvedValue({
        enabled: false,
        disabledReasons: ['file policy disabled'],
      });

      const resultPromise = provider.searchContextItems({
        query: 'file',
        workspaceFolders: [mockWorkspaceFolder],
        category: 'file',
      });

      await jest.runAllTimersAsync();
      const result = await resultPromise;

      expect(result[0].metadata.enabled).toBe(false);
      expect(result[0].metadata.disabledReasons).toEqual(['file policy disabled']);
    });

    it('disables item if DuoExclusionFilePolicyProvider disables it', async () => {
      jest.mocked(fuzzaldrinPlus.filter).mockReturnValue([mockFiles[0].uri.fsPath]);
      mockDuoExclusionFilePolicyProvider.isContextItemAllowed = jest.fn().mockResolvedValue({
        enabled: false,
        disabledReasons: ['duo exclusion policy disabled'],
      });

      const resultPromise = provider.searchContextItems({
        query: 'file',
        workspaceFolders: [mockWorkspaceFolder],
        category: 'file',
      });

      await jest.runAllTimersAsync();
      const result = await resultPromise;

      expect(result[0].metadata.enabled).toBe(false);
      expect(result[0].metadata.disabledReasons).toEqual(['duo exclusion policy disabled']);
    });

    it('combines disabled reasons from both FilePolicyProvider and DuoExclusionFilePolicyProvider', async () => {
      jest.mocked(fuzzaldrinPlus.filter).mockReturnValue([mockFiles[0].uri.fsPath]);
      mockFilePolicyProvider.isContextItemAllowed = jest.fn().mockResolvedValue({
        enabled: false,
        disabledReasons: ['file policy disabled'],
      });
      mockDuoExclusionFilePolicyProvider.isContextItemAllowed = jest.fn().mockResolvedValue({
        enabled: false,
        disabledReasons: ['duo exclusion policy disabled'],
      });

      const resultPromise = provider.searchContextItems({
        query: 'file',
        workspaceFolders: [mockWorkspaceFolder],
        category: 'file',
      });

      await jest.runAllTimersAsync();
      const result = await resultPromise;

      expect(result[0].metadata.enabled).toBe(false);
      expect(result[0].metadata.disabledReasons).toEqual(
        expect.arrayContaining(['file policy disabled', 'duo exclusion policy disabled']),
      );
    });

    it('disables item if DuoExclusionFilePolicyProvider disables it even if FilePolicyProvider allows it', async () => {
      jest.mocked(fuzzaldrinPlus.filter).mockReturnValue([mockFiles[0].uri.fsPath]);
      mockFilePolicyProvider.isContextItemAllowed = jest.fn().mockResolvedValue({
        enabled: true,
      });
      mockDuoExclusionFilePolicyProvider.isContextItemAllowed = jest.fn().mockResolvedValue({
        enabled: false,
        disabledReasons: ['duo exclusion policy disabled'],
      });

      const resultPromise = provider.searchContextItems({
        query: 'file',
        workspaceFolders: [mockWorkspaceFolder],
        category: 'file',
      });

      await jest.runAllTimersAsync();
      const result = await resultPromise;

      expect(result[0].metadata.enabled).toBe(false);
      expect(result[0].metadata.disabledReasons).toEqual(['duo exclusion policy disabled']);
    });

    it('disables item if FilePolicyProvider disables it even if DuoExclusionFilePolicyProvider allows it', async () => {
      jest.mocked(fuzzaldrinPlus.filter).mockReturnValue([mockFiles[0].uri.fsPath]);
      mockFilePolicyProvider.isContextItemAllowed = jest.fn().mockResolvedValue({
        enabled: false,
        disabledReasons: ['file policy disabled'],
      });
      mockDuoExclusionFilePolicyProvider.isContextItemAllowed = jest.fn().mockResolvedValue({
        enabled: true,
      });

      const resultPromise = provider.searchContextItems({
        query: 'file',
        workspaceFolders: [mockWorkspaceFolder],
        category: 'file',
      });

      await jest.runAllTimersAsync();
      const result = await resultPromise;

      expect(result[0].metadata.enabled).toBe(false);
      expect(result[0].metadata.disabledReasons).toEqual(['file policy disabled']);
    });

    it('combines policy disabled reasons with binary file disabled reason', async () => {
      jest.mocked(fuzzaldrinPlus.filter).mockReturnValue([mockFiles[0].uri.fsPath]);
      jest.mocked(isBinaryFile).mockResolvedValueOnce(true);
      mockFilePolicyProvider.isContextItemAllowed = jest.fn().mockResolvedValue({
        enabled: false,
        disabledReasons: ['file policy disabled'],
      });

      const resultPromise = provider.searchContextItems({
        query: 'file',
        workspaceFolders: [mockWorkspaceFolder],
        category: 'file',
      });

      await jest.runAllTimersAsync();
      const result = await resultPromise;

      expect(result[0].metadata.enabled).toBe(false);
      expect(result[0].metadata.disabledReasons).toEqual(
        expect.arrayContaining([BINARY_FILE_DISABLED_REASON, 'file policy disabled']),
      );
    });
  });

  describe('retrieveSelectedContextItemsWithContent', () => {
    it('should retrieve content for selected items', async () => {
      const mockItem: LocalFileAIContextItem = {
        id: 'file:///workspace/file1.ts',
        category: 'file',
        metadata: {
          title: 'file1.ts',
          enabled: true,
          icon: 'document',
          secondaryText: 'group/project - file1.ts',
          project: 'group/project',
          subType: 'local_file_search',
          subTypeLabel: 'Project file',
          relativePath: 'file1.ts',
          workspaceFolder: { uri: 'file:///workspace', name: 'workspace' },
        },
      };

      jest.spyOn(provider, 'getSelectedContextItems').mockResolvedValue([mockItem]);
      jest.mocked(mockFsClient.promises.readFile).mockResolvedValue('file content');

      const result = await provider.retrieveContextItemsWithContent();

      expect(result.length).toBe(1);
      expect(result[0].content).toBe('file content');
      expect(mockFsClient.promises.readFile).toHaveBeenCalledWith(
        `${path.sep}workspace${path.sep}file1.ts`,
      );
    });
  });

  describe('getItemWithContent', () => {
    it('should get the item with content included', async () => {
      const mockItem: LocalFileAIContextItem = {
        id: 'file:///workspace/file1.ts',
        category: 'file',
        metadata: {
          title: 'file1.ts',
          enabled: true,
          icon: 'document',
          secondaryText: 'group/project - file1.ts',
          project: 'group/project',
          subType: 'local_file_search',
          subTypeLabel: 'Project file',
          relativePath: 'file1.ts',
          workspaceFolder: { uri: 'file:///workspace', name: 'workspace' },
        },
      };

      jest.spyOn(provider, 'getSelectedContextItems').mockResolvedValue([mockItem]);
      jest.mocked(mockFsClient.promises.readFile).mockResolvedValue('file content');

      const result = await provider.getItemWithContent(mockItem);

      expect(result).toMatchObject({
        ...mockItem,
        content: 'file content',
      });
    });
  });
});
