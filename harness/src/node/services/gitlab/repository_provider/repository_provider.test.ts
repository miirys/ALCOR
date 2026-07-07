import { createFakePartial } from '@gitlab-org/test-utils';
import { TestLogger, Logger } from '@gitlab-org/logging';
import { ConfigService, DefaultConfigService } from '@gitlab-org/config';
import { GitLabApiService, UserService } from '@gitlab-org/core';
import { WorkspaceFolder } from 'vscode-languageserver-protocol';
import { SelectedProjectSetting } from '@gitlab-org/persistent-storage';
import { DuoWorkspaceProjectAccessCache, type DuoProject } from '@gitlab-org/legacy-common';
import { DefaultRepositoryProvider } from './repository_provider';
import { SelectedProjectStore } from './project_store';

type CacheUpdateListener = (data: Map<string, DuoProject[]>, signal: AbortSignal) => unknown;
type StoreUpdateListener = (e: SelectedProjectSetting[], signal: AbortSignal) => unknown;

describe('DefaultRepositoryProvider', () => {
  let repositoryProvider: DefaultRepositoryProvider;
  let mockLogger: Logger;
  let mockConfigService: ConfigService;
  let mockApiService: GitLabApiService;
  let mockUserService: UserService;
  let mockDuoWorkspaceProjectAccessCache: DuoWorkspaceProjectAccessCache;
  let mockSelectedProjectStore: SelectedProjectStore;
  let mockNotify: jest.Mock;

  const mockWorkspaceFolder = createFakePartial<WorkspaceFolder>({
    uri: 'file:///path/to/workspace',
    name: 'test-workspace',
  });

  const mockDuoProject = createFakePartial<DuoProject>({
    uri: 'file:///path/to/workspace/project/.git/config',
    projectPath: 'test-project',
    host: 'gitlab.com',
    namespace: 'test-namespace',
    namespaceWithPath: 'test-namespace/test-project',
    remoteName: 'origin',
    enabled: true,
    exclusionRules: [],
  });

  beforeEach(() => {
    mockLogger = new TestLogger();

    mockConfigService = new DefaultConfigService();
    mockConfigService.set('workspaceFolders', [mockWorkspaceFolder]);

    mockApiService = createFakePartial<GitLabApiService>({
      instanceInfo: {
        instanceUrl: new URL('https://gitlab.com'),
      },
    });

    mockUserService = createFakePartial<UserService>({
      user: {
        username: 'test-user',
        id: 'gid://gitlab/User/42',
        restId: 42,
      },
    });

    mockDuoWorkspaceProjectAccessCache = createFakePartial<DuoWorkspaceProjectAccessCache>({
      onDuoProjectCacheUpdate: jest.fn().mockReturnValue({ dispose: jest.fn() }),
      getProjectsForWorkspaceFolder: jest.fn().mockReturnValue([mockDuoProject]),
    });

    mockSelectedProjectStore = createFakePartial<SelectedProjectStore>({
      onSelectedProjectsChange: jest.fn().mockReturnValue({ dispose: jest.fn() }),
      getSelectedProjectSettings: jest.fn().mockResolvedValue([]),
    });

    mockNotify = jest.fn();

    repositoryProvider = new DefaultRepositoryProvider(
      mockLogger,
      mockConfigService,
      mockApiService,
      mockUserService,
      mockDuoWorkspaceProjectAccessCache,
      mockSelectedProjectStore,
    );
  });

  afterEach(() => {
    repositoryProvider.dispose();
  });

  describe('init', () => {
    it('should register cache update listener and notify client', async () => {
      await repositoryProvider.init(mockNotify);

      expect(mockDuoWorkspaceProjectAccessCache.onDuoProjectCacheUpdate).toHaveBeenCalledWith(
        expect.any(Function),
      );
      expect(mockSelectedProjectStore.onSelectedProjectsChange).toHaveBeenCalledWith(
        expect.any(Function),
      );
      expect(mockNotify).toHaveBeenCalledWith({
        repositories: expect.any(Array),
      });
    });

    it('should handle cache updates and notify client', async () => {
      const mockCacheUpdateCallback = jest.fn();
      jest
        .mocked(mockDuoWorkspaceProjectAccessCache.onDuoProjectCacheUpdate)
        .mockImplementation((callback) => {
          mockCacheUpdateCallback.mockImplementation(callback);
          return { dispose: jest.fn() };
        });

      await repositoryProvider.init(mockNotify);

      // Simulate cache update
      await mockCacheUpdateCallback();

      expect(mockNotify).toHaveBeenCalledTimes(2); // Once on init, once on cache update
    });

    it('should handle selected project store changes and notify client', async () => {
      const mockStoreUpdateCallback = jest.fn();
      jest
        .mocked(mockSelectedProjectStore.onSelectedProjectsChange)
        .mockImplementation((callback) => {
          mockStoreUpdateCallback.mockImplementation(callback);
          return { dispose: jest.fn() };
        });

      await repositoryProvider.init(mockNotify);

      await mockStoreUpdateCallback();

      expect(mockNotify).toHaveBeenCalledTimes(2); // Once on init, once on store update
    });
  });

  describe('getRepositories', () => {
    it('should return empty repositories initially', () => {
      const result = repositoryProvider.getRepositories();
      expect(result).toEqual({ repositories: [] });
    });

    it('should return repositories after initialization', async () => {
      await repositoryProvider.init(mockNotify);

      const result = repositoryProvider.getRepositories();
      expect(result.repositories).toHaveLength(1);

      const repository = result.repositories[0];
      expect(repository.type).toBe('single');
      expect(repository.repository).toMatchObject({
        rootFsPath: '/path/to/workspace/project',
        folderName: 'project',
      });

      if (repository.type === 'single') {
        expect(repository.projects).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              project: {
                name: 'test-project',
                namespaceWithPath: 'test-namespace/test-project',
                webUrl: 'https://gitlab.com/test-namespace/test-project',
              },
              account: {
                id: mockUserService.user?.id,
                restId: mockUserService.user?.restId,
                username: mockUserService.user?.username,
                instanceUrl: 'https://gitlab.com/',
              },
              pointer: expect.objectContaining({
                urlEntry: {
                  url: 'https://gitlab.com/test-namespace/test-project.git',
                  type: 'both',
                },
                remote: {
                  name: 'origin',
                  urls: [
                    {
                      url: 'https://gitlab.com/test-namespace/test-project.git',
                      type: 'both',
                    },
                  ],
                },
                repository: expect.objectContaining({
                  rootFsPath: '/path/to/workspace/project',
                  folderName: 'project',
                }),
              }),
              initializationType: 'detected',
            }),
          ]),
        );
        expect(repository.selectedProject).toBeDefined();
      }
    });
  });

  describe('#recalculate', () => {
    it('should handle no workspace folders', async () => {
      mockConfigService.set('workspaceFolders', undefined);

      await repositoryProvider.init(mockNotify);

      const result = repositoryProvider.getRepositories();
      expect(result.repositories).toHaveLength(0);
    });

    it('should handle empty workspace folders', async () => {
      mockConfigService.set('workspaceFolders', []);

      await repositoryProvider.init(mockNotify);

      const result = repositoryProvider.getRepositories();
      expect(result.repositories).toHaveLength(0);
    });

    it('should group projects by repository path', async () => {
      const duoProject1 = createFakePartial<DuoProject>({
        ...mockDuoProject,
        uri: 'file:///path/to/workspace/shared-repo/.git/config',
        projectPath: 'project-1',
        namespaceWithPath: 'namespace/project-1',
        remoteName: 'origin',
      });

      const duoProject2 = createFakePartial<DuoProject>({
        ...mockDuoProject,
        uri: 'file:///path/to/workspace/shared-repo/.git/config',
        projectPath: 'project-2',
        namespaceWithPath: 'namespace/project-2',
        remoteName: 'upstream',
      });

      jest
        .mocked(mockDuoWorkspaceProjectAccessCache.getProjectsForWorkspaceFolder)
        .mockReturnValue([duoProject1, duoProject2]);

      await repositoryProvider.init(mockNotify);

      const result = repositoryProvider.getRepositories();
      expect(result.repositories).toHaveLength(1);

      const repository = result.repositories[0];
      expect(repository.type).toBe('multiple');

      if (repository.type === 'multiple') {
        expect(repository.projects).toHaveLength(2);
        expect(repository.repository.remotes).toHaveLength(2);
      }
    });

    it('should handle multiple workspace folders', async () => {
      const mockWorkspaceFolder2 = createFakePartial<WorkspaceFolder>({
        uri: 'file:///path/to/workspace2',
        name: 'test-workspace-2',
      });

      mockConfigService.set('workspaceFolders', [mockWorkspaceFolder, mockWorkspaceFolder2]);

      jest
        .mocked(mockDuoWorkspaceProjectAccessCache.getProjectsForWorkspaceFolder)
        .mockImplementation((folder) => {
          if (folder === mockWorkspaceFolder) {
            return [mockDuoProject];
          }
          if (folder === mockWorkspaceFolder2) {
            return [
              {
                ...mockDuoProject,
                uri: 'file:///path/to/workspace2/project2/.git/config',
                projectPath: 'project-2',
                namespaceWithPath: 'namespace/project-2',
              },
            ];
          }
          return [];
        });

      await repositoryProvider.init(mockNotify);

      const result = repositoryProvider.getRepositories();
      expect(result.repositories).toHaveLength(2);
    });
  });

  describe('#transformToRepositoryState', () => {
    it('should set projectStatus to "none" when no projects', async () => {
      jest
        .mocked(mockDuoWorkspaceProjectAccessCache.getProjectsForWorkspaceFolder)
        .mockReturnValue([]);

      await repositoryProvider.init(mockNotify);

      const result = repositoryProvider.getRepositories();
      expect(result.repositories).toHaveLength(0);
    });

    it('should set projectStatus to "single" when one project', async () => {
      await repositoryProvider.init(mockNotify);

      const result = repositoryProvider.getRepositories();
      const repository = result.repositories[0];

      expect(repository.type).toBe('single');
      if (repository.type === 'single') {
        expect(repository.selectedProject).toBeDefined();
      }
    });

    it('should set projectStatus to "multiple" when multiple projects', async () => {
      const duoProject2 = createFakePartial<DuoProject>({
        ...mockDuoProject,
        projectPath: 'project-2',
        namespaceWithPath: 'namespace/project-2',
        remoteName: 'upstream',
      });

      jest
        .mocked(mockDuoWorkspaceProjectAccessCache.getProjectsForWorkspaceFolder)
        .mockReturnValue([mockDuoProject, duoProject2]);

      await repositoryProvider.init(mockNotify);

      const result = repositoryProvider.getRepositories();
      const repository = result.repositories[0];

      expect(repository.type).toBe('multiple');
    });

    it('should create unique remotes for different remote names', async () => {
      const duoProject2 = createFakePartial<DuoProject>({
        ...mockDuoProject,
        projectPath: 'project-2',
        namespaceWithPath: 'namespace/project-2',
        remoteName: 'upstream',
      });

      jest
        .mocked(mockDuoWorkspaceProjectAccessCache.getProjectsForWorkspaceFolder)
        .mockReturnValue([mockDuoProject, duoProject2]);

      await repositoryProvider.init(mockNotify);

      const result = repositoryProvider.getRepositories();
      const repository = result.repositories[0];

      expect(repository.repository.remotes).toHaveLength(2);
      expect(repository.repository.remotes.find((r) => r.name === 'origin')).toBeDefined();
      expect(repository.repository.remotes.find((r) => r.name === 'upstream')).toBeDefined();
    });

    it('should extract folder name from repository path', async () => {
      await repositoryProvider.init(mockNotify);

      const result = repositoryProvider.getRepositories();
      expect(result.repositories[0].repository.folderName).toBe('project');
    });
  });

  describe('user service integration', () => {
    it('should use user username when available', async () => {
      await repositoryProvider.init(mockNotify);

      const result = repositoryProvider.getRepositories();
      const repository = result.repositories[0];

      if (repository.type === 'single') {
        expect(repository.projects[0].account.id).toBe(mockUserService.user?.id);
        expect(repository.projects[0].account.username).toBe(mockUserService.user?.username);
        expect(repository.projects[0].account.restId).toBe(mockUserService.user?.restId);
      }
    });
  });

  describe('api service integration', () => {
    it('should use instance URL when available', async () => {
      await repositoryProvider.init(mockNotify);

      const result = repositoryProvider.getRepositories();
      const repository = result.repositories[0];

      if (repository.type === 'single') {
        expect(repository.projects[0].account.instanceUrl).toBe('https://gitlab.com/');
      }
    });
  });

  describe('dispose', () => {
    it('should dispose all subscriptions', async () => {
      const mockCacheDispose = jest.fn();
      const mockStoreDispose = jest.fn();

      jest.mocked(mockDuoWorkspaceProjectAccessCache.onDuoProjectCacheUpdate).mockReturnValue({
        dispose: mockCacheDispose,
      });

      jest.mocked(mockSelectedProjectStore.onSelectedProjectsChange).mockReturnValue({
        dispose: mockStoreDispose,
      });

      await repositoryProvider.init(mockNotify);
      repositoryProvider.dispose();

      expect(mockCacheDispose).toHaveBeenCalled();
      expect(mockStoreDispose).toHaveBeenCalled();
    });
  });

  describe('onRepositoriesChange', () => {
    it('should emit repositories when cache updates', async () => {
      jest.useFakeTimers();

      const mockListener = jest.fn();
      let cacheUpdateListener: CacheUpdateListener | null = null;

      jest
        .mocked(mockDuoWorkspaceProjectAccessCache.onDuoProjectCacheUpdate)
        .mockImplementation((callback) => {
          cacheUpdateListener = callback;
          return { dispose: jest.fn() };
        });

      await repositoryProvider.init(mockNotify);
      repositoryProvider.onRepositoriesChange(mockListener);

      // Clear initial calls
      mockListener.mockClear();

      // Change the mock to return different repositories
      const newProject = createFakePartial<DuoProject>({
        uri: 'file:///path/to/workspace/new-project/.git/config',
        projectPath: 'new-project',
        host: 'gitlab.com',
        namespace: 'test-namespace',
        namespaceWithPath: 'test-namespace/new-project',
        remoteName: 'origin',
        enabled: true,
        exclusionRules: [],
      });

      jest
        .mocked(mockDuoWorkspaceProjectAccessCache.getProjectsForWorkspaceFolder)
        .mockReturnValue([newProject]);

      // Simulate cache update
      if (cacheUpdateListener) {
        (cacheUpdateListener as unknown as CacheUpdateListener)(
          new Map(),
          new AbortController().signal,
        );
      }

      jest.advanceTimersByTime(500);
      await jest.runAllTimersAsync();

      expect(mockListener).toHaveBeenCalledWith(
        expect.objectContaining({
          repositories: expect.any(Array),
        }),
        expect.any(Object),
      );

      jest.useRealTimers();
    });

    it('should emit repositories when selected project store changes', async () => {
      jest.useFakeTimers();

      const mockListener = jest.fn();
      let storeUpdateListener: StoreUpdateListener | null = null;

      jest
        .mocked(mockSelectedProjectStore.onSelectedProjectsChange)
        .mockImplementation((callback) => {
          storeUpdateListener = callback;
          return { dispose: jest.fn() };
        });

      await repositoryProvider.init(mockNotify);
      repositoryProvider.onRepositoriesChange(mockListener);

      // Clear initial calls
      mockListener.mockClear();

      // Change the mock to return different selected projects
      jest.mocked(mockSelectedProjectStore.getSelectedProjectSettings).mockResolvedValue([
        {
          repositoryRootPath: '/path/to/workspace/project',
          namespaceWithPath: 'test-namespace/test-project',
          remoteName: 'origin',
          remoteUrl: 'https://gitlab.com/test-namespace/test-project.git',
          accountId: 'gid://gitlab/User/42',
        },
      ]);

      // Simulate store update
      if (storeUpdateListener) {
        (storeUpdateListener as unknown as StoreUpdateListener)([], new AbortController().signal);
      }

      jest.advanceTimersByTime(500);
      await jest.runAllTimersAsync();

      expect(mockListener).toHaveBeenCalledWith(
        expect.objectContaining({
          repositories: expect.any(Array),
        }),
        expect.any(Object),
      );

      jest.useRealTimers();
    });
  });
});
