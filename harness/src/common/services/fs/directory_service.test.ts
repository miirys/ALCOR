import { RepositoryService } from '@gitlab-org/repositories';
import { URI } from 'vscode-uri';
import { createFakePartial } from '@gitlab-org/test-utils';
import { OpenTabsService } from '../../open_tabs/open_tabs_service';
import { DefaultDirectoryService } from './directory_service';

describe('DefaultDirectoryService', () => {
  let service: DefaultDirectoryService;
  let mockRepositoryService: jest.Mocked<RepositoryService>;
  let mockOpenTabsService: jest.Mocked<OpenTabsService>;

  beforeEach(() => {
    mockRepositoryService = createFakePartial<jest.Mocked<RepositoryService>>({
      getCurrentFilesForWorkspace: jest.fn(),
    });

    mockOpenTabsService = createFakePartial<jest.Mocked<OpenTabsService>>({
      mostRecentTabs: jest.fn(),
    });

    service = new DefaultDirectoryService(mockRepositoryService, mockOpenTabsService);
  });

  describe('searchDirectories', () => {
    it('should retrieve directories from open tabs when search query is empty', async () => {
      const mockTabs = [
        {
          uri: 'file:///workspace/src/utils/helper.ts',
          workspaceFolder: { uri: 'file:///workspace', name: 'workspace' },
          fileRelativePath: 'src/utils/helper.ts',
          languageId: 'typescript',
          lastAccessed: Date.now(),
          lastModified: Date.now(),
          byteSize: 1000,
          prefix: '',
          suffix: '',
          position: { line: 0, character: 0 },
        },
        {
          uri: 'file:///workspace/tests/unit/feature/test.ts',
          workspaceFolder: { uri: 'file:///workspace', name: 'workspace' },
          fileRelativePath: 'tests/unit/feature/test.ts',
          languageId: 'typescript',
          lastAccessed: Date.now(),
          lastModified: Date.now(),
          byteSize: 500,
          prefix: '',
          suffix: '',
          position: { line: 0, character: 0 },
        },
      ];

      mockOpenTabsService.mostRecentTabs.mockReturnValue(mockTabs);

      const workspaceFolders = [{ uri: 'file:///workspace', name: 'workspace' }];
      const result = await service.searchDirectories('', workspaceFolders);

      expect(mockOpenTabsService.mostRecentTabs).toHaveBeenCalledWith({
        includeCurrentFile: true,
      });
      expect(result.length).toBe(5);

      const resultRelativePaths = result.map((item) => item.relativePath);

      expect(resultRelativePaths).toContainEqual('src');
      expect(resultRelativePaths).toContainEqual('src/utils');
      expect(resultRelativePaths).toContainEqual('tests');
      expect(resultRelativePaths).toContainEqual('tests/unit');
      expect(resultRelativePaths).toContainEqual('tests/unit/feature');
    });

    it('should retrieve directories and subdirectories matching a search query using fuzzy matching', async () => {
      const mockFiles = [
        {
          uri: URI.parse('file:///workspace/src/utils/helper.ts'),
          repositoryUri: URI.parse('file:///workspace'),
          isIgnored: false,
          workspaceFolder: { uri: 'file:///workspace', name: 'workspace' },
          dirUri: () => URI.parse('file:///workspace/src/utils'),
        },
        {
          uri: URI.parse('file:///workspace/tests/unit/test.ts'),
          repositoryUri: URI.parse('file:///workspace'),
          isIgnored: false,
          workspaceFolder: { uri: 'file:///workspace', name: 'workspace' },
          dirUri: () => URI.parse('file:///workspace/tests/unit'),
        },
        {
          uri: URI.parse('file:///workspace/src/components/Button.tsx'),
          repositoryUri: URI.parse('file:///workspace'),
          isIgnored: false,
          workspaceFolder: { uri: 'file:///workspace', name: 'workspace' },
          dirUri: () => URI.parse('file:///workspace/src/components'),
        },
      ];

      mockRepositoryService.getCurrentFilesForWorkspace.mockReturnValue(mockFiles);

      const workspaceFolders = [{ uri: 'file:///workspace', name: 'workspace' }];
      const result = await service.searchDirectories('src', workspaceFolders);

      // Should use repository service, not open tabs service when there's a query
      expect(mockRepositoryService.getCurrentFilesForWorkspace).toHaveBeenCalledWith(
        'file:///workspace',
        { excludeGitFolder: true, excludeIgnored: true },
      );
      expect(mockOpenTabsService.mostRecentTabs).not.toHaveBeenCalled();

      expect(result.length).toBeGreaterThan(0);

      const resultRelativePaths = result.map((item) => item.relativePath);

      expect(resultRelativePaths).toContain('src');
      expect(resultRelativePaths).toContain('src/utils');
      expect(resultRelativePaths).toContain('src/components');
    });

    it('should use fuzzy matching to find relevant directories', async () => {
      const mockFiles = [
        {
          uri: URI.parse('file:///workspace/src/main/graphql/mutations/CreateIssue.graphql'),
          repositoryUri: URI.parse('file:///workspace'),
          isIgnored: false,
          workspaceFolder: { uri: 'file:///workspace', name: 'workspace' },
          dirUri: () => URI.parse('file:///workspace/src/main/graphql/mutations'),
        },
        {
          uri: URI.parse(
            'file:///workspace/src/main/kotlin/com/gitlab/plugin/codesuggestions/actions/Action.kt',
          ),
          repositoryUri: URI.parse('file:///workspace'),
          isIgnored: false,
          workspaceFolder: { uri: 'file:///workspace', name: 'workspace' },
          dirUri: () =>
            URI.parse(
              'file:///workspace/src/main/kotlin/com/gitlab/plugin/codesuggestions/actions',
            ),
        },
      ];

      mockRepositoryService.getCurrentFilesForWorkspace.mockReturnValue(mockFiles);

      const workspaceFolders = [{ uri: 'file:///workspace', name: 'workspace' }];

      // Test search for "graphql mutation" - should use fuzzy matching to find "graphql/mutations"
      const mutationResult = await service.searchDirectories('graphql mutation', workspaceFolders);
      const mutationRelativePaths = mutationResult.map((item) => item.relativePath);

      expect(mutationRelativePaths).toContain('src/main/graphql/mutations');
    });

    it('should retrieve directories and subdirectories matching a query when including multiple workspace folders', async () => {
      const mockFiles1 = [
        {
          uri: URI.parse('file:///workspace1/src/app.ts'),
          repositoryUri: URI.parse('file:///workspace1'),
          isIgnored: false,
          workspaceFolder: { uri: 'file:///workspace1', name: 'workspace1' },
          dirUri: () => URI.parse('file:///workspace1/src'),
        },
      ];

      const mockFiles2 = [
        {
          uri: URI.parse('file:///workspace2/src/app.ts'),
          repositoryUri: URI.parse('file:///workspace2'),
          isIgnored: false,
          workspaceFolder: { uri: 'file:///workspace2', name: 'workspace2' },
          dirUri: () => URI.parse('file:///workspace2/src'),
        },
        {
          uri: URI.parse('file:///workspace2/lib/utils.ts'),
          repositoryUri: URI.parse('file:///workspace2'),
          isIgnored: false,
          workspaceFolder: { uri: 'file:///workspace2', name: 'workspace2' },
          dirUri: () => URI.parse('file:///workspace2/lib'),
        },
      ];

      mockRepositoryService.getCurrentFilesForWorkspace
        .mockReturnValueOnce(mockFiles1)
        .mockReturnValueOnce(mockFiles2);

      const workspaceFolders = [
        { uri: 'file:///workspace1', name: 'workspace1' },
        { uri: 'file:///workspace2', name: 'workspace2' },
      ];
      const result = await service.searchDirectories('src', workspaceFolders);

      expect(result.length).toBeGreaterThan(0);

      const workspace1SrcDir = result.find(
        (item) => item.workspaceFolder.name === 'workspace1' && item.relativePath === 'src',
      );
      expect(workspace1SrcDir).toBeDefined();
      expect(workspace1SrcDir!.uri.toString()).toBe('file:///workspace1/src');

      const workspace2SrcDir = result.find(
        (item) => item.workspaceFolder.name === 'workspace2' && item.relativePath === 'src',
      );
      expect(workspace2SrcDir).toBeDefined();
      expect(workspace2SrcDir!.uri.toString()).toBe('file:///workspace2/src');
    });

    it('should handle empty file list', async () => {
      mockRepositoryService.getCurrentFilesForWorkspace.mockReturnValue([]);

      const workspaceFolders = [{ uri: 'file:///workspace', name: 'workspace' }];
      const result = await service.searchDirectories('test', workspaceFolders);

      expect(result).toEqual([]);
    });
  });
});
