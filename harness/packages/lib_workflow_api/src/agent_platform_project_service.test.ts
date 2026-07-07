import { TestLogger } from '@gitlab-org/logging';
import { createFakePartial } from '@gitlab-org/test-utils';
import type {
  GitLabApiService,
  RepositoryProvider,
  GetRepositoriesResponse,
} from '@gitlab-org/core';
import { Disposable } from '@gitlab-org/disposable';
import { DefaultAgentPlatformProjectService } from './agent_platform_project_service';
import { AgentPlatformProjectStore } from './agent_platform_project_store';

describe('DefaultAgentPlatformProjectService', () => {
  let service: DefaultAgentPlatformProjectService;
  let mockRepositoryProvider: RepositoryProvider;
  let mockSelectedProjectStore: AgentPlatformProjectStore;
  let mockApi: GitLabApiService;
  let mockLogger: TestLogger;

  const mockRepositoriesResponse = createFakePartial<GetRepositoriesResponse>({
    repositories: [
      {
        type: 'single',
        repository: {
          rootFsPath: '/path/to/repo',
          folderName: 'repo',
          remotes: [],
        },
        projects: [
          {
            project: {
              name: 'test-project',
              namespaceWithPath: 'namespace/test-project',
              webUrl: 'https://gitlab.com/namespace/test-project',
            },
            pointer: {
              remote: {
                name: 'origin',
              },
            },
          },
        ],
      },
    ],
  });

  beforeEach(() => {
    jest.useFakeTimers();

    mockRepositoryProvider = createFakePartial<RepositoryProvider>({
      getRepositories: jest.fn(),
      onRepositoriesChange: jest.fn(() => {
        return { dispose: jest.fn() } as Disposable;
      }),
    });

    mockSelectedProjectStore = createFakePartial<AgentPlatformProjectStore>({
      setSelectedProject: jest.fn(),
      getSelectedProject: jest.fn(),
    });

    mockApi = createFakePartial<GitLabApiService>({
      fetchFromApi: jest.fn(),
    });

    mockLogger = new TestLogger();
    jest.spyOn(mockLogger, 'debug');
    jest.spyOn(mockLogger, 'error');

    service = new DefaultAgentPlatformProjectService(
      mockRepositoryProvider,
      mockSelectedProjectStore,
      mockApi,
      mockLogger,
    );
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('getRepositories', () => {
    it('should return enriched repositories with DAP availability', async () => {
      jest.mocked(mockRepositoryProvider.getRepositories).mockReturnValue(mockRepositoriesResponse);
      jest.mocked(mockApi.fetchFromApi).mockResolvedValue({
        project: {
          id: 'gid://gitlab/Project/456',
          duoAgenticChatAvailable: true,
          duoFeaturesEnabled: true,
        },
      });

      const result = await service.getRepositories();

      expect(mockRepositoryProvider.getRepositories).toHaveBeenCalled();
      expect(result.repositories).toHaveLength(1);
      expect(result.repositories[0]).toEqual({
        type: 'single',
        rootFsPath: '/path/to/repo',
        folderName: 'repo',
        projects: [
          {
            id: 'gid://gitlab/Project/456',
            name: 'test-project',
            namespaceWithPath: 'namespace/test-project',
            remoteName: 'origin',
            duoAgenticChatAvailable: true,
            duoFeaturesEnabled: true,
            namespaceId: null,
            rootNamespaceId: null,
          },
        ],
      });
    });

    it('should filter out repositories with type "none"', async () => {
      const mockResponseWithNone = createFakePartial<GetRepositoriesResponse>({
        repositories: [
          {
            type: 'none',
            repository: {
              rootFsPath: '/path/to/empty',
              folderName: 'empty-repo',
              remotes: [],
            },
          },
          {
            type: 'single',
            repository: {
              rootFsPath: '/path/to/repo',
              folderName: 'repo',
              remotes: [],
            },
            projects: [
              {
                project: {
                  name: 'test-project',
                  namespaceWithPath: 'namespace/test-project',
                },
                pointer: {
                  remote: {
                    name: 'origin',
                  },
                },
              },
            ],
          },
        ],
      });

      jest.mocked(mockRepositoryProvider.getRepositories).mockReturnValue(mockResponseWithNone);
      jest.mocked(mockApi.fetchFromApi).mockResolvedValue({
        project: {
          id: 'gid://gitlab/Project/456',
          duoAgenticChatAvailable: true,
        },
      });

      const result = await service.getRepositories();

      expect(result.repositories).toHaveLength(1);
      expect(result.repositories[0].type).toBe('single');
    });
  });

  describe('setSelectedProject', () => {
    it('should delegate to the selected project store', async () => {
      const repositoryPath = '/path/to/repo';
      const namespaceWithPath = 'namespace/project';

      await service.setSelectedProject(repositoryPath, namespaceWithPath);

      expect(mockSelectedProjectStore.setSelectedProject).toHaveBeenCalledWith(
        repositoryPath,
        namespaceWithPath,
      );
      expect(mockLogger.debug).toHaveBeenCalledWith(
        `[AgentPlatformProjectService] Setting selected project for ${repositoryPath}: ${namespaceWithPath}`,
        undefined,
      );
    });
  });

  describe('getSelectedProject', () => {
    it('should delegate to the selected project store', async () => {
      const repositoryPath = '/path/to/repo';
      const expectedProject = 'namespace/project';

      jest.mocked(mockSelectedProjectStore.getSelectedProject).mockResolvedValue(expectedProject);

      const result = await service.getSelectedProject(repositoryPath);

      expect(result).toBe(expectedProject);
      expect(mockSelectedProjectStore.getSelectedProject).toHaveBeenCalledWith(repositoryPath);
    });

    it('should return null when no project is selected', async () => {
      const repositoryPath = '/path/to/repo';

      jest.mocked(mockSelectedProjectStore.getSelectedProject).mockResolvedValue(null);

      const result = await service.getSelectedProject(repositoryPath);

      expect(result).toBeNull();
    });
  });

  describe('getProjectData', () => {
    it('should return availability and project ID when project has DAP access', async () => {
      const projectPath = 'namespace/test-project';
      const mockResponse = {
        project: {
          id: 'gid://gitlab/Project/456',
          duoAgenticChatAvailable: true,
          duoFeaturesEnabled: true,
        },
      };

      jest.mocked(mockApi.fetchFromApi).mockResolvedValue(mockResponse);

      const result = await service.getProjectData(projectPath);

      expect(result).toEqual({
        duoAgenticChatAvailable: true,
        duoFeaturesEnabled: true,
        projectId: 'gid://gitlab/Project/456',
        namespaceId: null,
        rootNamespaceId: null,
      });
      expect(mockApi.fetchFromApi).toHaveBeenCalledWith({
        type: 'graphql',
        query: expect.any(String),
        variables: {
          projectPath,
          rootNamespacePath: 'namespace',
        },
        supportedSinceInstanceVersion: {
          version: '18.1.0',
          resourceName: 'get project data',
        },
      });
    });

    it('should return unavailable when project does not have DAP access', async () => {
      const projectPath = 'namespace/test-project';
      const mockResponse = {
        project: {
          id: 'gid://gitlab/Project/456',
          duoAgenticChatAvailable: false,
          duoFeaturesEnabled: false,
        },
      };

      jest.mocked(mockApi.fetchFromApi).mockResolvedValue(mockResponse);

      const result = await service.getProjectData(projectPath);

      expect(result).toEqual({
        duoAgenticChatAvailable: false,
        duoFeaturesEnabled: false,
        projectId: 'gid://gitlab/Project/456',
        namespaceId: null,
        rootNamespaceId: null,
      });
    });

    it('should reflect the project duoFeaturesEnabled toggle', async () => {
      const projectPath = 'group/test-project';
      const mockResponse = {
        project: {
          id: 'gid://gitlab/Project/456',
          duoAgenticChatAvailable: false,
          duoFeaturesEnabled: false,
        },
      };

      jest.mocked(mockApi.fetchFromApi).mockResolvedValue(mockResponse);

      const result = await service.getProjectData(projectPath);

      expect(result.duoFeaturesEnabled).toBe(false);
    });

    it('should handle missing project data', async () => {
      const projectPath = 'namespace/test-project';
      const mockResponse = {
        project: null,
      };

      jest.mocked(mockApi.fetchFromApi).mockResolvedValue(mockResponse);

      const result = await service.getProjectData(projectPath);

      expect(result).toEqual({
        duoAgenticChatAvailable: false,
        duoFeaturesEnabled: false,
        projectId: null,
        namespaceId: null,
        rootNamespaceId: null,
      });
    });

    it('should handle API errors gracefully', async () => {
      const projectPath = 'namespace/test-project';
      const error = new Error('API error');

      jest.mocked(mockApi.fetchFromApi).mockRejectedValue(error);

      const result = await service.getProjectData(projectPath);

      expect(result).toEqual({
        duoAgenticChatAvailable: false,
        duoFeaturesEnabled: false,
        projectId: null,
        namespaceId: null,
        rootNamespaceId: null,
      });
      expect(mockLogger.error).toHaveBeenCalledWith(
        `[AgentPlatformProjectService] Error for ${projectPath}: Error: API error`,
        undefined,
      );
    });

    it('should return GraphQL GIDs without conversion', async () => {
      const projectPath = 'namespace/test-project';
      const mockResponse = {
        project: {
          id: 'gid://gitlab/Project/789',
          duoAgenticChatAvailable: true,
        },
      };

      jest.mocked(mockApi.fetchFromApi).mockResolvedValue(mockResponse);

      const result = await service.getProjectData(projectPath);

      expect(result.projectId).toBe('gid://gitlab/Project/789');
    });
  });

  describe('onRepositoriesChange', () => {
    it('should register listener for repository changes', async () => {
      const mockListener = jest.fn();

      service.onRepositoriesChange(mockListener);

      expect(mockRepositoryProvider.onRepositoriesChange).toHaveBeenCalled();
    });

    it('should emit repositories when repository provider changes', async () => {
      const mockListener = jest.fn();

      jest.mocked(mockRepositoryProvider.getRepositories).mockReturnValue(mockRepositoriesResponse);
      jest.mocked(mockApi.fetchFromApi).mockResolvedValue({
        project: {
          id: 'gid://gitlab/Project/456',
          duoAgenticChatAvailable: true,
        },
      });

      service.onRepositoriesChange(mockListener);

      // Simulate repository provider notifying about changes
      const onRepositoriesChangeCall = jest.mocked(mockRepositoryProvider.onRepositoriesChange).mock
        .calls[0];
      const listener = onRepositoriesChangeCall?.[0];
      if (listener) {
        listener({} as GetRepositoriesResponse, {} as AbortSignal);
      }

      // Wait for async operations to complete
      await jest.runAllTimersAsync();

      expect(mockListener).toHaveBeenCalledWith(
        expect.objectContaining({
          repositories: expect.any(Array),
        }),
        expect.any(Object),
      );
    });

    it('should handle errors when emitting repositories', async () => {
      const mockListener = jest.fn();

      jest.mocked(mockRepositoryProvider.getRepositories).mockImplementation(() => {
        throw new Error('Repository provider error');
      });

      service.onRepositoriesChange(mockListener);

      const onRepositoriesChangeCall = jest.mocked(mockRepositoryProvider.onRepositoriesChange).mock
        .calls[0];
      const listener = onRepositoriesChangeCall?.[0];
      if (listener) {
        listener({} as GetRepositoriesResponse, {} as AbortSignal);
      }

      // Wait for async operations to complete
      await jest.runAllTimersAsync();

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('Error notifying repositories changed'),
        undefined,
      );
    });
  });
});
