import { GitLabApiService } from '@gitlab-org/core';
import { Logger } from '@gitlab-org/logging';
import { DuoChatAIRequest } from '@gitlab-org/ai-context';
import { createFakePartial } from '@gitlab-org/test-utils';
import { RemoteRepositoryContextItemStrategy } from './remote_repository_context_item_strategy';

jest.mock('@gitlab-org/logging', () => ({
  ...jest.requireActual('@gitlab-org/logging'),
  withPrefix: jest.fn((logger) => logger),
}));

describe('RemoteRepositoryContextItemStrategy', () => {
  let strategy: RemoteRepositoryContextItemStrategy;
  let mockGitLabApiService: jest.Mocked<GitLabApiService>;
  let mockLogger: jest.Mocked<Logger>;

  const createMockQuery = (query = ''): DuoChatAIRequest => ({
    category: 'repository' as const,
    query,
    workspaceFolders: [],
  });

  beforeEach(() => {
    mockGitLabApiService = createFakePartial<jest.Mocked<GitLabApiService>>({
      fetchFromApi: jest.fn(),
      instanceInfo: {
        instanceVersion: '18.8.0',
      },
    });

    mockLogger = createFakePartial<jest.Mocked<Logger>>({
      debug: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    });

    strategy = new RemoteRepositoryContextItemStrategy(mockGitLabApiService, mockLogger);
  });

  describe('isSupported', () => {
    it('should return true for GitLab version 18.8.0', () => {
      expect(strategy.isSupported()).toBe(true);
    });

    it('should return true for GitLab version 18.9.0', () => {
      const apiService = createFakePartial<jest.Mocked<GitLabApiService>>({
        instanceInfo: { instanceVersion: '18.9.0' },
      });
      const testStrategy = new RemoteRepositoryContextItemStrategy(apiService, mockLogger);
      expect(testStrategy.isSupported()).toBe(true);
    });

    it('should return true for GitLab version 19.0.0', () => {
      const apiService = createFakePartial<jest.Mocked<GitLabApiService>>({
        instanceInfo: { instanceVersion: '19.0.0' },
      });
      const testStrategy = new RemoteRepositoryContextItemStrategy(apiService, mockLogger);
      expect(testStrategy.isSupported()).toBe(true);
    });

    it('should return false for GitLab version 18.7.0', () => {
      const apiService = createFakePartial<jest.Mocked<GitLabApiService>>({
        instanceInfo: { instanceVersion: '18.7.0' },
      });
      const testStrategy = new RemoteRepositoryContextItemStrategy(apiService, mockLogger);
      expect(testStrategy.isSupported()).toBe(false);
    });

    it('should return false for GitLab version 17.0.0', () => {
      const apiService = createFakePartial<jest.Mocked<GitLabApiService>>({
        instanceInfo: { instanceVersion: '17.0.0' },
      });
      const testStrategy = new RemoteRepositoryContextItemStrategy(apiService, mockLogger);
      expect(testStrategy.isSupported()).toBe(false);
    });

    it('should return false when instance version is not available', () => {
      const apiService = createFakePartial<jest.Mocked<GitLabApiService>>({
        instanceInfo: undefined,
      });
      const testStrategy = new RemoteRepositoryContextItemStrategy(apiService, mockLogger);
      expect(testStrategy.isSupported()).toBe(false);
    });
  });

  describe('getInitialRepositories', () => {
    it('should fetch projects from API with empty search term', async () => {
      const mockResponse = {
        aiChatIncludedProjects: {
          nodes: [
            {
              id: 'gid://gitlab/Project/123',
              name: 'gitlab',
              fullPath: 'gitlab-org/gitlab',
              webUrl: 'https://gitlab.com/gitlab-org/gitlab',
              description: 'GitLab CE/EE',
            },
          ],
        },
      };

      mockGitLabApiService.fetchFromApi.mockResolvedValue(mockResponse);

      const query = createMockQuery();
      const result = await strategy.getInitialRepositories(query);

      expect(mockGitLabApiService.fetchFromApi).toHaveBeenCalledWith({
        type: 'graphql',
        query: expect.any(String),
        variables: {
          search: '',
        },
      });

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        id: 'gid://gitlab/Project/123',
        name: 'gitlab',
        pathWithNamespace: 'gitlab-org/gitlab',
        webUrl: 'https://gitlab.com/gitlab-org/gitlab',
        description: 'GitLab CE/EE',
        numericId: 123,
      });
    });

    it('should handle empty description', async () => {
      const mockResponse = {
        aiChatIncludedProjects: {
          nodes: [
            {
              id: 'gid://gitlab/Project/456',
              name: 'test-project',
              fullPath: 'test-org/test-project',
              webUrl: 'https://gitlab.com/test-org/test-project',
              description: null,
            },
          ],
        },
      };

      mockGitLabApiService.fetchFromApi.mockResolvedValue(mockResponse);

      const query = createMockQuery();
      const result = await strategy.getInitialRepositories(query);

      expect(result[0].description).toBe('');
    });

    it('should return empty array when API call fails', async () => {
      mockGitLabApiService.fetchFromApi.mockRejectedValue(new Error('API error'));

      const query = createMockQuery();
      const result = await strategy.getInitialRepositories(query);

      expect(result).toEqual([]);
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to fetch projects from remote API',
        expect.any(Error),
      );
    });

    it('should filter out projects with invalid IDs', async () => {
      const mockResponse = {
        aiChatIncludedProjects: {
          nodes: [
            {
              id: 'gid://gitlab/Project/123',
              name: 'valid-project',
              fullPath: 'org/valid-project',
              webUrl: 'https://gitlab.com/org/valid-project',
              description: 'Valid',
            },
            {
              id: 'invalid-id',
              name: 'invalid-project',
              fullPath: 'org/invalid-project',
              webUrl: 'https://gitlab.com/org/invalid-project',
              description: 'Invalid',
            },
          ],
        },
      };

      mockGitLabApiService.fetchFromApi.mockResolvedValue(mockResponse);

      const query = createMockQuery();
      const result = await strategy.getInitialRepositories(query);

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('valid-project');
      expect(mockLogger.warn).toHaveBeenCalledWith('Failed to parse project ID: invalid-id');
    });
  });

  describe('searchRepositories', () => {
    it('should fetch projects with search term', async () => {
      const mockResponse = {
        aiChatIncludedProjects: {
          nodes: [
            {
              id: 'gid://gitlab/Project/789',
              name: 'search-result',
              fullPath: 'org/search-result',
              webUrl: 'https://gitlab.com/org/search-result',
              description: 'Found by search',
            },
          ],
        },
      };

      mockGitLabApiService.fetchFromApi.mockResolvedValue(mockResponse);

      const query = createMockQuery('search-term');
      const result = await strategy.searchRepositories(query);

      expect(mockGitLabApiService.fetchFromApi).toHaveBeenCalledWith({
        type: 'graphql',
        query: expect.any(String),
        variables: {
          search: 'search-term',
        },
      });

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('search-result');
    });

    it('should trim search query', async () => {
      const mockResponse = {
        aiChatIncludedProjects: {
          nodes: [],
        },
      };

      mockGitLabApiService.fetchFromApi.mockResolvedValue(mockResponse);

      const query = createMockQuery('  search-term  ');
      await strategy.searchRepositories(query);

      expect(mockGitLabApiService.fetchFromApi).toHaveBeenCalledWith(
        expect.objectContaining({
          variables: {
            search: 'search-term',
          },
        }),
      );
    });

    it('should return empty array on API error', async () => {
      mockGitLabApiService.fetchFromApi.mockRejectedValue(new Error('Network error'));

      const query = createMockQuery('test');
      const result = await strategy.searchRepositories(query);

      expect(result).toEqual([]);
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to fetch projects from remote API',
        expect.any(Error),
      );
    });

    it('should handle multiple projects in response', async () => {
      const mockResponse = {
        aiChatIncludedProjects: {
          nodes: [
            {
              id: 'gid://gitlab/Project/1',
              name: 'project-1',
              fullPath: 'org/project-1',
              webUrl: 'https://gitlab.com/org/project-1',
              description: 'First',
            },
            {
              id: 'gid://gitlab/Project/2',
              name: 'project-2',
              fullPath: 'org/project-2',
              webUrl: 'https://gitlab.com/org/project-2',
              description: 'Second',
            },
            {
              id: 'gid://gitlab/Project/3',
              name: 'project-3',
              fullPath: 'org/project-3',
              webUrl: 'https://gitlab.com/org/project-3',
              description: 'Third',
            },
          ],
        },
      };

      mockGitLabApiService.fetchFromApi.mockResolvedValue(mockResponse);

      const query = createMockQuery('project');
      const result = await strategy.searchRepositories(query);

      expect(result).toHaveLength(3);
      expect(result[0].numericId).toBe(1);
      expect(result[1].numericId).toBe(2);
      expect(result[2].numericId).toBe(3);
    });
  });
});
