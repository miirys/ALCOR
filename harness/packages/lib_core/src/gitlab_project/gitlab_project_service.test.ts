import type { Logger } from '@gitlab-org/logging';
import { createMockLogger } from '@gitlab-org/webview/test_utils';
import { createFakePartial } from '@gitlab-org/test-utils';
import type { GitLabGID } from '../utils/gid_utils';
import type { GitLabApiService } from '../gitlab_api/service';
import type { ProjectDetails } from './types/gitlab_project_details';
import { DefaultProjectService, type ProjectService } from './gitlab_project_service';

describe('DefaultProjectService', () => {
  let service: ProjectService;
  let mockGitLabApiService: GitLabApiService;
  let mockLogger: Logger;

  beforeEach(() => {
    mockLogger = createMockLogger();
    mockGitLabApiService = createFakePartial<GitLabApiService>({
      fetchFromApi: jest.fn(),
    });

    service = new DefaultProjectService(mockLogger, mockGitLabApiService);
  });

  describe('getProjectFromPathWithNamespace', () => {
    const mockProjectDetails: ProjectDetails = {
      id: 'gid://gitlab/Project/123',
      namespace: {
        id: 'gid://gitlab/Namespace/1234',
        rootNamespace: {
          id: 'gid://gitlab/Group/9970',
        },
      },
    };

    beforeEach(() => {
      jest.mocked(mockGitLabApiService.fetchFromApi).mockResolvedValue({
        project: mockProjectDetails,
      });
    });

    it('should call GitLabApiService with correct GraphQL query', async () => {
      const projectPath = 'gitlab-org/gitlab-vscode-extension';
      await service.getProjectFromPathWithNamespace(projectPath);

      expect(mockGitLabApiService.fetchFromApi).toHaveBeenCalledWith({
        type: 'graphql',
        query: expect.stringContaining('getProjectDetails'),
        variables: {
          fullPath: projectPath,
        },
      });
    });

    it('should handle project paths with special characters', async () => {
      const projectPath = 'my-group/sub-group/my project@123';
      await service.getProjectFromPathWithNamespace(projectPath);

      expect(mockGitLabApiService.fetchFromApi).toHaveBeenCalledWith({
        type: 'graphql',
        query: expect.stringContaining('getProjectDetails'),
        variables: {
          fullPath: projectPath,
        },
      });
    });

    it('should handle deeply nested project paths', async () => {
      const projectPath = 'group/subgroup/nested/deeply/project-name';
      await service.getProjectFromPathWithNamespace(projectPath);

      expect(mockGitLabApiService.fetchFromApi).toHaveBeenCalledWith({
        type: 'graphql',
        query: expect.stringContaining('getProjectDetails'),
        variables: {
          fullPath: projectPath,
        },
      });
    });

    it('should return the project details', async () => {
      const result = await service.getProjectFromPathWithNamespace(
        'gitlab-org/gitlab-vscode-extension',
      );
      expect(result).toEqual(mockProjectDetails);
    });
  });

  describe('getProjectIdsFromPaths', () => {
    const mockResponse = {
      projects: {
        nodes: [
          { id: 'gid://gitlab/Project/123', fullPath: 'gitlab-org/gitlab' },
          { id: 'gid://gitlab/Project/456', fullPath: 'group/project' },
        ],
      },
    };

    beforeEach(() => {
      jest.mocked(mockGitLabApiService.fetchFromApi).mockResolvedValue(mockResponse);
    });

    it('should call GitLabApiService with correct GraphQL query', async () => {
      const projectPaths = ['gitlab-org/gitlab', 'group/project'];
      await service.getProjectIdsFromPaths(projectPaths);

      expect(mockGitLabApiService.fetchFromApi).toHaveBeenCalledWith({
        type: 'graphql',
        query: expect.stringContaining('getProjectIds'),
        variables: {
          fullPaths: projectPaths,
        },
      });
    });

    it('should return project IDs and full paths', async () => {
      const projectPaths = ['gitlab-org/gitlab', 'group/project'];
      const result = await service.getProjectIdsFromPaths(projectPaths);

      expect(result).toEqual([
        { id: 'gid://gitlab/Project/123', fullPath: 'gitlab-org/gitlab' },
        { id: 'gid://gitlab/Project/456', fullPath: 'group/project' },
      ]);
    });

    it('should handle empty project paths array', async () => {
      await service.getProjectIdsFromPaths([]);
      expect(mockGitLabApiService.fetchFromApi).toHaveBeenCalledWith({
        type: 'graphql',
        query: expect.stringContaining('getProjectIds'),
        variables: {
          fullPaths: [],
        },
      });
    });
  });

  describe('filterToProjectsWithDuoEligible', () => {
    const mockResponse = {
      projects: {
        nodes: [{ id: 'gid://gitlab/Project/123', fullPath: 'gitlab-org/gitlab' }],
      },
    };

    beforeEach(() => {
      jest.mocked(mockGitLabApiService.fetchFromApi).mockResolvedValue(mockResponse);
    });

    it('should call GitLabApiService with correct GraphQL query', async () => {
      const projectIds: GitLabGID[] = ['gid://gitlab/Project/123', 'gid://gitlab/Project/456'];
      await service.filterToProjectsWithDuoEligible(projectIds);

      expect(mockGitLabApiService.fetchFromApi).toHaveBeenCalledWith({
        type: 'graphql',
        query: expect.stringContaining('getDuoEligibleProjects'),
        variables: {
          ids: projectIds,
          withDuoEligible: true,
        },
      });
    });

    it('should return duo eligible projects', async () => {
      const projectIds: GitLabGID[] = ['gid://gitlab/Project/123', 'gid://gitlab/Project/456'];
      const result = await service.filterToProjectsWithDuoEligible(projectIds);

      expect(result).toEqual([{ id: 'gid://gitlab/Project/123', fullPath: 'gitlab-org/gitlab' }]);
    });

    it('should handle API errors gracefully', async () => {
      const projectIds: GitLabGID[] = ['gid://gitlab/Project/123'];
      jest.mocked(mockGitLabApiService.fetchFromApi).mockRejectedValue(new Error('API error'));

      const result = await service.filterToProjectsWithDuoEligible(projectIds);
      expect(result).toEqual([]);
    });

    it('should handle unknown argument errors gracefully', async () => {
      const projectIds: GitLabGID[] = ['gid://gitlab/Project/123'];
      jest
        .mocked(mockGitLabApiService.fetchFromApi)
        .mockRejectedValue(new Error("Unknown argument 'withDuoEligible' on field 'projects'"));

      const result = await service.filterToProjectsWithDuoEligible(projectIds);
      expect(result).toEqual([]);
    });
  });
});
