import { WorkspaceFolder } from 'vscode-languageserver';
import { URI } from 'vscode-uri';
import { createFakePartial } from '@gitlab-org/test-utils';
import { RepositoryService } from '@gitlab-org/repositories';
import { Logger, TestLogger } from '@gitlab-org/logging';
import type { DuoChatAIRequest, DependencyAIContextItem } from '@gitlab-org/ai-context';
import { Repository } from '../../services/git/repository';
import { DefaultDependencyContextProvider } from './dependencies';
import { DependencyScanner } from './depdendency_scanner/scanner';
import { DEPENDENCY_TYPES, ParsedDependency } from './depdendency_scanner/types';

describe('DefaultDependencyContextProvider', () => {
  let provider: DefaultDependencyContextProvider;
  let mockRepositoryService: RepositoryService;
  let mockDependencyScanner: DependencyScanner;
  let logger: Logger;

  beforeEach(() => {
    logger = new TestLogger();
    mockRepositoryService = createFakePartial<RepositoryService>({
      getRepositoriesForWorkspace: jest.fn(),
    });
    mockDependencyScanner = createFakePartial<DependencyScanner>({
      findDependencies: jest.fn(),
    });

    provider = new DefaultDependencyContextProvider(
      logger,
      mockRepositoryService,
      mockDependencyScanner,
    );
  });

  describe('constructor', () => {
    it('should create an instance with the correct category', () => {
      expect(provider.type).toBe('dependency');
    });
  });

  describe('searchContextItems', () => {
    it('should return dependency items for all repositories in the workspace', async () => {
      const mockWorkspaceFolder: WorkspaceFolder = { uri: 'file:///workspace', name: 'workspace' };
      const mockQuery: DuoChatAIRequest = {
        workspaceFolders: [mockWorkspaceFolder],
        category: 'dependency',
        query: '',
      };

      const mockRepo1 = {
        uri: URI.parse('file:///workspace/repo1'),
        workspaceFolder: mockWorkspaceFolder,
      } as Repository;
      const mockRepo2 = {
        uri: URI.parse('file:///workspace/repo2'),
        workspaceFolder: mockWorkspaceFolder,
      } as Repository;

      jest
        .mocked(mockRepositoryService)
        .getRepositoriesForWorkspace.mockResolvedValue([mockRepo1, mockRepo2]);

      jest.mocked(mockDependencyScanner).findDependencies.mockResolvedValue([
        {
          type: DEPENDENCY_TYPES[0],
          libs: [{ name: 'test-lib', version: '1.0.0' }],
          fileUri: URI.file('workspace/package.json'),
        },
      ]);

      const result = await provider.searchContextItems(mockQuery);

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('file:///workspace/repo1');
      expect(result[0].metadata.title).toBe('repo1');
      expect(result[0].metadata.secondaryText).toBe('package.json');
      expect(result[1].id).toBe('file:///workspace/repo2');
      expect(result[1].metadata.title).toBe('repo2');
      expect(result[1].metadata.secondaryText).toBe('package.json');
      expect(result[0].metadata.libs).toEqual([{ name: 'test-lib', version: '1.0.0' }]);
      expect(result[1].metadata.libs).toEqual([{ name: 'test-lib', version: '1.0.0' }]);
    });

    it('should handle errors from dependency scanner', async () => {
      const mockWorkspaceFolder: WorkspaceFolder = { uri: 'file:///workspace', name: 'workspace' };
      const mockQuery: DuoChatAIRequest = {
        workspaceFolders: [mockWorkspaceFolder],
        category: 'dependency',
        query: '',
      };

      const mockRepo = {
        uri: URI.parse('file:///repo'),
        workspaceFolder: mockWorkspaceFolder,
      } as Repository;

      jest.mocked(mockRepositoryService).getRepositoriesForWorkspace.mockResolvedValue([mockRepo]);

      jest
        .mocked(mockDependencyScanner)
        .findDependencies.mockRejectedValue(new Error('Scan failed'));

      const result = await provider.searchContextItems(mockQuery);

      expect(result).toHaveLength(0);
    });

    it('should fuzzy filter based on repo url', async () => {
      const mockWorkspaceFolder: WorkspaceFolder = { uri: 'file:///workspace', name: 'workspace' };
      const mockQuery: DuoChatAIRequest = {
        workspaceFolders: [mockWorkspaceFolder],
        category: 'dependency',
        query: 'repo1',
      };

      const mockRepo1 = {
        uri: URI.parse('file:///workspace/repo1'),
        workspaceFolder: mockWorkspaceFolder,
      } as Repository;
      const mockRepo2 = {
        uri: URI.parse('file:///workspace/repo2'),
        workspaceFolder: mockWorkspaceFolder,
      } as Repository;

      jest
        .mocked(mockRepositoryService)
        .getRepositoriesForWorkspace.mockResolvedValue([mockRepo1, mockRepo2]);

      jest.mocked(mockDependencyScanner).findDependencies.mockResolvedValue([
        {
          type: DEPENDENCY_TYPES[0],
          libs: [{ name: 'test-lib', version: '1.0.0' }],
          fileUri: URI.file('workspace/subdir/package.json'),
        },
      ]);

      const result = await provider.searchContextItems(mockQuery);

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('file:///workspace/repo1');
      expect(result[0].metadata.title).toBe('repo1');
      expect(result[0].metadata.secondaryText).toBe('subdir/package.json');
      expect(result[0].metadata.libs).toEqual([{ name: 'test-lib', version: '1.0.0' }]);
    });

    it('should format found files with comma and space', async () => {
      const mockWorkspaceFolder: WorkspaceFolder = { uri: 'file:///workspace', name: 'workspace' };
      const mockQuery: DuoChatAIRequest = {
        workspaceFolders: [mockWorkspaceFolder],
        category: 'dependency',
        query: '',
      };

      const mockRepo = {
        uri: URI.parse('file:///workspace/repo1'),
        workspaceFolder: mockWorkspaceFolder,
      } as Repository;

      jest.mocked(mockRepositoryService).getRepositoriesForWorkspace.mockResolvedValue([mockRepo]);

      jest.mocked(mockDependencyScanner).findDependencies.mockResolvedValue([
        {
          type: DEPENDENCY_TYPES[0],
          libs: [{ name: 'lib1', version: '1.0.0' }],
          fileUri: URI.file('workspace/package.json'),
        },
        {
          type: DEPENDENCY_TYPES[0],
          libs: [{ name: 'lib2', version: '2.0.0' }],
          fileUri: URI.file('workspace/subfolder/package.json'),
        },
      ]);

      const result = await provider.searchContextItems(mockQuery);

      expect(result[0].metadata.secondaryText).toBe('package.json, subfolder/package.json');
    });

    it('should exclude dependencies with empty libs from content and foundFiles', async () => {
      const mockWorkspaceFolder: WorkspaceFolder = { uri: 'file:///workspace', name: 'workspace' };
      const mockQuery: DuoChatAIRequest = {
        workspaceFolders: [mockWorkspaceFolder],
        category: 'dependency',
        query: '',
      };

      const mockRepo = {
        uri: URI.parse('file:///workspace/repo1'),
        workspaceFolder: mockWorkspaceFolder,
      } as Repository;

      jest.mocked(mockRepositoryService).getRepositoriesForWorkspace.mockResolvedValue([mockRepo]);

      jest.mocked(mockDependencyScanner).findDependencies.mockResolvedValue([
        {
          type: { lang: 'javascript', type: '', fileName: '' },
          libs: [{ name: 'vue', version: '3.0.0' }],
          fileUri: URI.file('workspace/package.json'),
        },
        {
          type: { lang: 'python', type: '', fileName: '' },
          libs: [], // Empty libs
          fileUri: URI.file('workspace/requirements.txt'),
        },
        {
          type: { lang: 'ruby', type: '', fileName: '' },
          libs: [{ name: 'rails', version: '7.0.0' }],
          fileUri: URI.file('workspace/Gemfile'),
        },
      ]);

      const result = await provider.searchContextItems(mockQuery);
      const content = JSON.parse(result[0].content!);

      expect(content.find((x: Record<string, unknown>) => 'python' in x)).toBeUndefined();
      expect(result[0].metadata.secondaryText).not.toContain('requirements.txt');
    });
  });

  describe('retrieveSelectedContextItemsWithContent', () => {
    it('should return selected context items', async () => {
      const mockSelectedItems = [
        {
          id: 'file:///repo1',
          metadata: { enabled: true, subType: 'dependency' },
        } as DependencyAIContextItem,
        {
          id: 'file:///repo2',
          metadata: { enabled: true, subType: 'dependency' },
        } as DependencyAIContextItem,
      ];

      jest.spyOn(provider, 'getSelectedContextItems').mockResolvedValue(mockSelectedItems);

      const result = await provider.retrieveContextItemsWithContent();

      expect(result).toEqual(mockSelectedItems);
    });
  });

  describe('dependenciesContent', () => {
    it('should correctly stringify dependencies', () => {
      const sampleDeps: ParsedDependency[] = [
        {
          type: {
            lang: 'javascript',
            type: '',
            fileName: '',
          },
          libs: [
            { name: 'react', version: '17.0.2' },
            { name: 'lodash', version: '4.17.21' },
          ],
          fileUri: URI.file('package.json'),
        },
        {
          type: {
            lang: 'python',
            type: '',
            fileName: '',
          },
          libs: [
            { name: 'requests', version: '2.26.0' },
            { name: 'pandas', version: '1.3.3' },
          ],
          fileUri: URI.file('package.json'),
        },
      ];

      const result = provider.dependenciesContent(sampleDeps);

      const expected = JSON.stringify([
        {
          javascript: ['react@17.0.2', 'lodash@4.17.21'],
        },
        {
          python: ['requests@2.26.0', 'pandas@1.3.3'],
        },
      ]);

      expect(result).toBe(expected);
    });

    it('should return empty array string for empty input', () => {
      const emptyDeps: ParsedDependency[] = [];

      const result = provider.dependenciesContent(emptyDeps);

      expect(result).toBe('[]');
    });
  });
});
