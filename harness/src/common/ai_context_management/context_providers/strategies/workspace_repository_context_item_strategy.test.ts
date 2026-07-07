import {
  parseGitLabRemote,
  RepositoryDiscoveryService,
  StatelessRepository,
} from '@gitlab-org/repositories';
import { Logger } from '@gitlab-org/logging';
import { DuoChatAIRequest } from '@gitlab-org/ai-context';
import { createFakePartial } from '@gitlab-org/test-utils';
import { WorkspaceFolder } from 'vscode-languageserver-protocol';
import { ConfigService } from '@gitlab-org/config';
import { ProjectService } from '@gitlab-org/core';
import { WorkspaceRepositoryContextItemStrategy } from './workspace_repository_context_item_strategy';

jest.mock('@gitlab-org/repositories', () => ({
  parseGitLabRemote: jest.fn(),
}));

jest.mock('@gitlab-org/logging', () => ({
  ...jest.requireActual('@gitlab-org/logging'),
  withPrefix: jest.fn((logger) => logger),
}));

describe('WorkspaceRepositoryContextItemStrategy', () => {
  let strategy: WorkspaceRepositoryContextItemStrategy;
  let mockRepositoryService: jest.Mocked<RepositoryDiscoveryService>;
  let mockConfigService: ConfigService;
  let mockProjectService: jest.Mocked<ProjectService>;
  let mockLogger: jest.Mocked<Logger>;
  let mockRepository: jest.Mocked<StatelessRepository>;

  const createMockQuery = (
    workspaceFolders: WorkspaceFolder[] = [{ uri: 'file:///workspace', name: 'workspace' }],
  ): DuoChatAIRequest => ({
    category: 'repository' as const,
    query: '',
    workspaceFolders,
  });

  beforeEach(() => {
    mockRepositoryService = createFakePartial<jest.Mocked<RepositoryDiscoveryService>>({
      getRepositoriesForWorkspace: jest.fn(),
    });

    mockConfigService = createFakePartial<ConfigService>({
      get: jest.fn(),
    });

    mockProjectService = createFakePartial<jest.Mocked<ProjectService>>({
      getProjectIdsFromPaths: jest.fn(),
      filterToProjectsWithDuoEligible: jest.fn(),
    });

    mockLogger = createFakePartial<jest.Mocked<Logger>>({
      debug: jest.fn(),
      warn: jest.fn(),
    });

    mockRepository = createFakePartial<jest.Mocked<StatelessRepository>>({
      listRemotes: jest.fn(),
    });

    strategy = new WorkspaceRepositoryContextItemStrategy(
      mockRepositoryService,
      mockConfigService,
      mockProjectService,
      mockLogger,
    );
  });

  describe('isSupported', () => {
    it('should always return true for workspace strategy', () => {
      expect(strategy.isSupported()).toBe(true);
    });
  });

  describe('getInitialRepositories', () => {
    beforeEach(() => {
      (mockConfigService.get as jest.Mock).mockReturnValue('https://gitlab.com');
    });

    it('should return empty array when no workspace folders are configured', async () => {
      const query = createMockQuery([]);
      const result = await strategy.getInitialRepositories(query);
      expect(result).toEqual([]);
    });

    it('should filter repositories to only include those that are Duo eligible', async () => {
      const query = createMockQuery();
      mockRepositoryService.getRepositoriesForWorkspace.mockResolvedValue([mockRepository]);
      mockRepository.listRemotes.mockResolvedValue([
        { remote: 'origin', url: 'https://gitlab.com/gitlab-org/gitlab.git' },
      ]);

      (parseGitLabRemote as jest.MockedFunction<typeof parseGitLabRemote>).mockReturnValue({
        host: 'gitlab.com',
        namespace: 'gitlab-org',
        projectPath: 'gitlab',
        namespaceWithPath: 'gitlab-org/gitlab',
      });

      // Mock project service responses
      mockProjectService.getProjectIdsFromPaths.mockResolvedValue([
        { id: 'gid://gitlab/Project/123', fullPath: 'gitlab-org/gitlab' },
      ]);
      mockProjectService.filterToProjectsWithDuoEligible.mockResolvedValue([
        { id: 'gid://gitlab/Project/123', fullPath: 'gitlab-org/gitlab' },
      ]);

      const result = await strategy.getInitialRepositories(query);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        id: 'gid://gitlab/Project/123',
        name: 'gitlab',
        pathWithNamespace: 'gitlab-org/gitlab',
        webUrl: 'https://gitlab.com/gitlab-org/gitlab',
        description: '',
        numericId: 123,
      });

      expect(mockProjectService.getProjectIdsFromPaths).toHaveBeenCalledWith(['gitlab-org/gitlab']);
      expect(mockProjectService.filterToProjectsWithDuoEligible).toHaveBeenCalledWith([
        'gid://gitlab/Project/123',
      ]);
    });

    it('should return empty array when no repositories have Duo eligible enabled', async () => {
      const query = createMockQuery();
      mockRepositoryService.getRepositoriesForWorkspace.mockResolvedValue([mockRepository]);
      mockRepository.listRemotes.mockResolvedValue([
        { remote: 'origin', url: 'https://gitlab.com/gitlab-org/gitlab.git' },
      ]);

      (parseGitLabRemote as jest.MockedFunction<typeof parseGitLabRemote>).mockReturnValue({
        host: 'gitlab.com',
        namespace: 'gitlab-org',
        projectPath: 'gitlab',
        namespaceWithPath: 'gitlab-org/gitlab',
      });

      mockProjectService.getProjectIdsFromPaths.mockResolvedValue([
        { id: 'gid://gitlab/Project/123', fullPath: 'gitlab-org/gitlab' },
      ]);
      mockProjectService.filterToProjectsWithDuoEligible.mockResolvedValue([]);

      const result = await strategy.getInitialRepositories(query);
      expect(result).toHaveLength(0);
    });

    it('should handle project service errors gracefully', async () => {
      const query = createMockQuery();
      mockRepositoryService.getRepositoriesForWorkspace.mockResolvedValue([mockRepository]);
      mockRepository.listRemotes.mockResolvedValue([
        { remote: 'origin', url: 'https://gitlab.com/gitlab-org/gitlab.git' },
      ]);

      (parseGitLabRemote as jest.MockedFunction<typeof parseGitLabRemote>).mockReturnValue({
        host: 'gitlab.com',
        namespace: 'gitlab-org',
        projectPath: 'gitlab',
        namespaceWithPath: 'gitlab-org/gitlab',
      });

      mockProjectService.getProjectIdsFromPaths.mockRejectedValue(
        new Error('Project service error'),
      );

      const result = await strategy.getInitialRepositories(query);
      expect(result).toHaveLength(0);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Failed to filter duo eligible projects',
        expect.any(Error),
      );
    });

    it('should ignore repositories with no GitLab remotes', async () => {
      const query = createMockQuery();
      mockRepositoryService.getRepositoriesForWorkspace.mockResolvedValue([mockRepository]);
      mockRepository.listRemotes.mockResolvedValue([
        { remote: 'origin', url: 'https://github.com/user/repo.git' },
      ]);

      (parseGitLabRemote as jest.MockedFunction<typeof parseGitLabRemote>).mockReturnValue(
        undefined,
      );

      const result = await strategy.getInitialRepositories(query);
      expect(result).toEqual([]);
    });

    it('should ignore repositories that throw errors', async () => {
      const query = createMockQuery();
      mockRepositoryService.getRepositoriesForWorkspace.mockResolvedValue([mockRepository]);
      mockRepository.listRemotes.mockRejectedValue(new Error('Git error'));

      const result = await strategy.getInitialRepositories(query);
      expect(result).toEqual([]);
    });
  });

  describe('searchRepositories', () => {
    beforeEach(() => {
      (mockConfigService.get as jest.Mock).mockReturnValue('https://gitlab.com');
    });

    it('should return all items when query is empty', async () => {
      const query = createMockQuery();
      query.query = '';

      mockRepositoryService.getRepositoriesForWorkspace.mockResolvedValue([mockRepository]);
      mockRepository.listRemotes.mockResolvedValue([
        { remote: 'origin', url: 'https://gitlab.com/gitlab-org/gitlab.git' },
      ]);

      (parseGitLabRemote as jest.MockedFunction<typeof parseGitLabRemote>).mockReturnValue({
        host: 'gitlab.com',
        namespace: 'gitlab-org',
        projectPath: 'gitlab',
        namespaceWithPath: 'gitlab-org/gitlab',
      });

      mockProjectService.getProjectIdsFromPaths.mockResolvedValue([
        { id: 'gid://gitlab/Project/123', fullPath: 'gitlab-org/gitlab' },
      ]);
      mockProjectService.filterToProjectsWithDuoEligible.mockResolvedValue([
        { id: 'gid://gitlab/Project/123', fullPath: 'gitlab-org/gitlab' },
      ]);

      const result = await strategy.searchRepositories(query);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        id: 'gid://gitlab/Project/123',
        name: 'gitlab',
        pathWithNamespace: 'gitlab-org/gitlab',
        webUrl: 'https://gitlab.com/gitlab-org/gitlab',
        description: '',
        numericId: 123,
      });
    });

    it('should filter repositories using fuzzy search when cache is populated', async () => {
      const query = createMockQuery();
      query.query = 'gitl';

      // First populate the cache with mock data
      mockRepositoryService.getRepositoriesForWorkspace.mockResolvedValue([mockRepository]);
      mockRepository.listRemotes.mockResolvedValue([
        { remote: 'origin', url: 'https://gitlab.com/gitlab-org/gitlab.git' },
      ]);

      (parseGitLabRemote as jest.MockedFunction<typeof parseGitLabRemote>).mockReturnValue({
        host: 'gitlab.com',
        namespace: 'gitlab-org',
        projectPath: 'gitlab',
        namespaceWithPath: 'gitlab-org/gitlab',
      });

      mockProjectService.getProjectIdsFromPaths.mockResolvedValue([
        { id: 'gid://gitlab/Project/123', fullPath: 'gitlab-org/gitlab' },
      ]);
      mockProjectService.filterToProjectsWithDuoEligible.mockResolvedValue([
        { id: 'gid://gitlab/Project/123', fullPath: 'gitlab-org/gitlab' },
      ]);

      // Populate cache first
      await strategy.getInitialRepositories(query);

      // Reset mock call count
      mockProjectService.getProjectIdsFromPaths.mockClear();
      mockProjectService.filterToProjectsWithDuoEligible.mockClear();

      // Now search - should use cache and filter
      const result = await strategy.searchRepositories(query);

      // Should NOT have called the project service again (using cache)
      expect(mockProjectService.getProjectIdsFromPaths).toHaveBeenCalledTimes(0);
      expect(mockProjectService.filterToProjectsWithDuoEligible).toHaveBeenCalledTimes(0);

      // Should return items that match "gitl"
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('gitlab');
    });

    it('should call getInitialRepositories when no cache available', async () => {
      const query = createMockQuery();
      query.query = 'test';

      mockRepositoryService.getRepositoriesForWorkspace.mockResolvedValue([mockRepository]);
      mockRepository.listRemotes.mockResolvedValue([
        { remote: 'origin', url: 'https://gitlab.com/gitlab-org/gitlab.git' },
      ]);

      (parseGitLabRemote as jest.MockedFunction<typeof parseGitLabRemote>).mockReturnValue({
        host: 'gitlab.com',
        namespace: 'gitlab-org',
        projectPath: 'gitlab',
        namespaceWithPath: 'gitlab-org/gitlab',
      });

      mockProjectService.getProjectIdsFromPaths.mockResolvedValue([
        { id: 'gid://gitlab/Project/123', fullPath: 'gitlab-org/gitlab' },
      ]);
      mockProjectService.filterToProjectsWithDuoEligible.mockResolvedValue([
        { id: 'gid://gitlab/Project/123', fullPath: 'gitlab-org/gitlab' },
      ]);

      const result = await strategy.searchRepositories(query);

      // Should have called project service methods
      expect(mockProjectService.getProjectIdsFromPaths).toHaveBeenCalledTimes(1);
      expect(mockProjectService.filterToProjectsWithDuoEligible).toHaveBeenCalledTimes(1);
      expect(result).toHaveLength(0); // No match for "test" in "gitlab gitlab-org/gitlab"
    });

    it('should use cached items when available for search', async () => {
      const query = createMockQuery();
      query.query = 'gitlab';

      // First call getInitialRepositories to populate cache
      mockRepositoryService.getRepositoriesForWorkspace.mockResolvedValue([mockRepository]);
      mockRepository.listRemotes.mockResolvedValue([
        { remote: 'origin', url: 'https://gitlab.com/gitlab-org/gitlab.git' },
      ]);

      (parseGitLabRemote as jest.MockedFunction<typeof parseGitLabRemote>).mockReturnValue({
        host: 'gitlab.com',
        namespace: 'gitlab-org',
        projectPath: 'gitlab',
        namespaceWithPath: 'gitlab-org/gitlab',
      });

      mockProjectService.getProjectIdsFromPaths.mockResolvedValue([
        { id: 'gid://gitlab/Project/123', fullPath: 'gitlab-org/gitlab' },
      ]);
      mockProjectService.filterToProjectsWithDuoEligible.mockResolvedValue([
        { id: 'gid://gitlab/Project/123', fullPath: 'gitlab-org/gitlab' },
      ]);

      // First call to populate cache
      await strategy.getInitialRepositories(query);
      expect(mockProjectService.getProjectIdsFromPaths).toHaveBeenCalledTimes(1);

      // Reset mock call count
      mockProjectService.getProjectIdsFromPaths.mockClear();
      mockProjectService.filterToProjectsWithDuoEligible.mockClear();

      // Second call should use cache
      const result = await strategy.searchRepositories(query);

      // Should NOT have called the project service again
      expect(mockProjectService.getProjectIdsFromPaths).toHaveBeenCalledTimes(0);
      expect(mockProjectService.filterToProjectsWithDuoEligible).toHaveBeenCalledTimes(0);
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('gitlab');
    });
  });
});
