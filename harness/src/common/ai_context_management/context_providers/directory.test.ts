import { URI } from 'vscode-uri';
import { createFakePartial } from '@gitlab-org/test-utils';
import { GitLabGID, ProjectService } from '@gitlab-org/core';
import { Logger, TestLogger } from '@gitlab-org/logging';
import { DuoFeature } from '@gitlab-org/duo-feature-access';
import { DuoProjectAccessChecker } from '../../services/duo_access';
import { DuoProjectStatus } from '../../services/duo_access/project_access_checker';
import { DirectoryService, DirectorySearchResult } from '../../services/fs/directory_service';
import { DefaultDirectoryContextProvider } from './directory';

describe('DefaultDirectoryContextProvider', () => {
  let provider: DefaultDirectoryContextProvider;
  let mockDirectoryService: jest.Mocked<DirectoryService>;
  let mockProjectAccessChecker: jest.Mocked<DuoProjectAccessChecker>;
  let mockProjectService: jest.Mocked<ProjectService>;
  let logger: Logger;

  beforeEach(() => {
    logger = new TestLogger();
    mockDirectoryService = createFakePartial<jest.Mocked<DirectoryService>>({
      searchDirectories: jest.fn(),
    });

    mockProjectAccessChecker = createFakePartial<jest.Mocked<DuoProjectAccessChecker>>({
      checkProjectStatus: jest.fn(),
    });

    mockProjectService = createFakePartial<jest.Mocked<ProjectService>>({
      getProjectFromPathWithNamespace: jest.fn(),
    });

    provider = new DefaultDirectoryContextProvider(
      logger,
      mockDirectoryService,
      mockProjectAccessChecker,
      mockProjectService,
    );
  });

  describe('searchContextItems', () => {
    it('retrieves directories from open tabs when query is empty', async () => {
      const mockDirectoryResults: DirectorySearchResult[] = [
        {
          uri: URI.parse('file:///workspace/src/components'),
          workspaceFolder: { uri: 'file:///workspace', name: 'workspace' },
          relativePath: 'src/components',
        },
        {
          uri: URI.parse('file:///workspace/src/utils'),
          workspaceFolder: { uri: 'file:///workspace', name: 'workspace' },
          relativePath: 'src/utils',
        },
        {
          uri: URI.parse('file:///workspace/src'),
          workspaceFolder: { uri: 'file:///workspace', name: 'workspace' },
          relativePath: 'src',
        },
      ];

      mockDirectoryService.searchDirectories.mockResolvedValue(mockDirectoryResults);
      mockProjectAccessChecker.checkProjectStatus.mockReturnValue({
        project: {
          namespaceWithPath: 'test/project',
          host: 'gitlab.com',
          namespace: 'test',
          projectPath: 'project',
          uri: 'file:///workspace/.git/config',
          enabled: true,
          exclusionRules: [],
          remoteName: 'origin',
        },
        status: DuoProjectStatus.DuoEnabled,
      });

      const query = {
        category: 'directory' as const,
        query: '',
        workspaceFolders: [{ uri: 'file:///workspace', name: 'workspace' }],
      };

      const result = await provider.searchContextItems(query);

      expect(mockDirectoryService.searchDirectories).toHaveBeenCalledWith('', [
        query.workspaceFolders[0],
      ]);
      expect(result.length).toBe(3);

      const relativePaths = result.map((item) => item.metadata.relativePath);
      expect(relativePaths).toEqual(['src/components', 'src/utils', 'src']);

      result.forEach((item) => {
        expect(item.category).toBe('directory');
        expect(item.metadata.subType).toBe('directory');
        expect(item.metadata.subTypeLabel).toBe('Directory');
        expect(item.metadata.icon).toBe('folder');
        expect(item.id).toMatch(/^file:\/\/\//);
      });
    });

    it('retrieves matching directories when query is provided', async () => {
      const mockDirectoryResults: DirectorySearchResult[] = [
        {
          uri: URI.parse('file:///workspace/src/utils'),
          workspaceFolder: { uri: 'file:///workspace', name: 'workspace' },
          relativePath: 'src/utils',
        },
        {
          uri: URI.parse('file:///workspace/src/components'),
          workspaceFolder: { uri: 'file:///workspace', name: 'workspace' },
          relativePath: 'src/components',
        },
        {
          uri: URI.parse('file:///workspace/src'),
          workspaceFolder: { uri: 'file:///workspace', name: 'workspace' },
          relativePath: 'src',
        },
      ];

      mockDirectoryService.searchDirectories.mockResolvedValue(mockDirectoryResults);
      mockProjectAccessChecker.checkProjectStatus.mockReturnValue({
        project: {
          namespaceWithPath: 'test/project',
          host: 'gitlab.com',
          namespace: 'test',
          projectPath: 'project',
          uri: 'file:///workspace/.git/config',
          enabled: true,
          exclusionRules: [],
          remoteName: 'origin',
        },
        status: DuoProjectStatus.DuoEnabled,
      });

      mockProjectService.getProjectFromPathWithNamespace.mockResolvedValue({
        id: '123',
        namespace: {
          id: 'gid://gitlab/Namespace/1234',
          rootNamespace: {
            id: 'gid://gitlab/Namespace/123',
          },
        },
      });

      const query = {
        category: 'directory' as const,
        query: 'src',
        workspaceFolders: [{ uri: 'file:///workspace', name: 'workspace' }],
      };

      const result = await provider.searchContextItems(query);

      expect(mockDirectoryService.searchDirectories).toHaveBeenCalledWith('src', [
        query.workspaceFolders[0],
      ]);
      expect(result.length).toBe(3);
      expect(result.map((item) => item.metadata.relativePath)).toEqual([
        'src/utils',
        'src/components',
        'src',
      ]);
    });

    it('should handle empty search results gracefully', async () => {
      mockDirectoryService.searchDirectories.mockResolvedValue([]);

      const query = {
        category: 'directory' as const,
        query: 'nonexistent',
        workspaceFolders: [{ uri: 'file:///workspace', name: 'workspace' }],
      };

      const result = await provider.searchContextItems(query);

      expect(mockDirectoryService.searchDirectories).toHaveBeenCalledWith('nonexistent', [
        query.workspaceFolders[0],
      ]);
      expect(result).toEqual([]);
    });

    it('should handle empty results from directory service gracefully', async () => {
      mockDirectoryService.searchDirectories.mockResolvedValue([]);

      const query = {
        category: 'directory' as const,
        query: '',
        workspaceFolders: [{ uri: 'file:///workspace', name: 'workspace' }],
      };

      const result = await provider.searchContextItems(query);

      expect(mockDirectoryService.searchDirectories).toHaveBeenCalledWith('', [
        query.workspaceFolders[0],
      ]);
      expect(result).toEqual([]);
    });
  });

  describe('retrieveContextItemsWithContent', () => {
    it('should return correct items', async () => {
      mockProjectService.getProjectFromPathWithNamespace.mockResolvedValue({
        id: '123',
        namespace: {
          id: 'gid://gitlab/Namespace/1234',
          rootNamespace: {
            id: 'gid://gitlab/Namespace/123',
          },
        },
      });

      const mockItem = {
        id: 'file:///workspace/src',
        category: 'directory' as const,
        metadata: {
          title: 'src',
          enabled: true,
          disabledReasons: [],
          namespace: 'mynamespace',
          projectPathWithNamespace: 'mynamespace/myproject',
          projectId: 'gid://gitlab/mynamespace/myproject' as GitLabGID,
          icon: 'folder' as const,
          secondaryText: 'src',
          subType: 'directory' as const,
          subTypeLabel: 'Directory',
          relativePath: 'src',
        },
      };

      jest.spyOn(provider, 'getSelectedContextItems').mockResolvedValue([mockItem]);

      const result = await provider.retrieveContextItemsWithContent();

      const expectedContent =
        `Directory Path: "src"\n` +
        `Project Global ID: "gid://gitlab/Project/123"\n` +
        `Project Path: "mynamespace/myproject"`;

      expect(result).toHaveLength(1);
      expect(result[0].content).toBe(expectedContent);
      expect(result[0].id).toBe('file:///workspace/src');
      expect(result[0].metadata.relativePath).toBe('src');
      expect(result[0].metadata.projectId).toBe('gid://gitlab/Project/123');
    });
  });

  describe('getItemWithContent', () => {
    it('should return item with empty content', async () => {
      const mockItem = {
        id: 'file:///workspace/src/components',
        category: 'directory' as const,
        metadata: {
          title: 'components',
          enabled: true,
          disabledReasons: [],
          namespace: 'mynamespace',
          projectPathWithNamespace: 'mynamespace/myproject',
          projectId: 'gid://gitlab/Project/1234' as GitLabGID,
          icon: 'folder' as const,
          secondaryText: 'src/components',
          subType: 'directory' as const,
          subTypeLabel: 'Directory',
          relativePath: 'src/components',
        },
      };

      const result = await provider.getItemWithContent(mockItem);

      const expectedContent =
        `Directory Path: "src/components"\n` +
        `Project Global ID: "gid://gitlab/Project/1234"\n` +
        `Project Path: "mynamespace/myproject"`;

      expect(result.content).toBe(expectedContent);
      expect(result.id).toBe('file:///workspace/src/components');
      expect(result.metadata.relativePath).toBe('src/components');
    });
  });

  describe('provider configuration', () => {
    it('should have correct provider type', () => {
      expect(provider.type).toBe('directory');
    });

    it('should have correct duo required feature', () => {
      expect(provider.chatRequiredFeature).toBe(DuoFeature.IncludeRepositoryContext);
    });
  });
});
