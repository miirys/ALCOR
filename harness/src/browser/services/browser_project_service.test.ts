import type { GitLabApiService, ProjectResponse } from '@gitlab-org/core';
import type { Logger } from '@gitlab-org/logging';
import type { ConfigService } from '@gitlab-org/config';
import { createMockLogger } from '@gitlab-org/webview/test_utils';
import { createFakePartial } from '@gitlab-org/test-utils/browser';
import { BrowserProjectService } from './browser_project_service';

describe('BrowserProjectService', () => {
  let service: BrowserProjectService;
  let mockConfigService: ConfigService;
  let mockGitLabApiService: GitLabApiService;
  let mockLogger: Logger;

  beforeEach(() => {
    mockLogger = createMockLogger();
    mockConfigService = createFakePartial<ConfigService>({
      get: jest.fn(),
    });
    mockGitLabApiService = createFakePartial<GitLabApiService>({
      fetchFromApi: jest.fn(),
    });
    service = new BrowserProjectService(mockConfigService, mockGitLabApiService, mockLogger);
  });

  describe('getProjectByFileURI', () => {
    const mockProjectResponse = createFakePartial<ProjectResponse>({
      id: 123,
      path_with_namespace: 'group/project',
      web_url: 'https://gitlab.example.com/group/project',
    });

    beforeEach(() => {
      jest.mocked(mockGitLabApiService.fetchFromApi).mockResolvedValue(mockProjectResponse);
    });

    it('returns cached project if already fetched', async () => {
      jest.mocked(mockConfigService.get<'projectPath'>).mockReturnValue('group/project');

      const firstResult = await service.getProjectByFileURI();
      const secondResult = await service.getProjectByFileURI();

      expect(mockGitLabApiService.fetchFromApi).toHaveBeenCalledTimes(1);
      expect(firstResult).toBe(secondResult);
      expect(firstResult).toEqual({
        id: 123,
        namespaceWithPath: 'group/project',
        uri: 'https://gitlab.example.com/group/project',
      });
    });

    it('fetches project when webIdeProjectPath is provided', async () => {
      const webIdeProjectPath = 'group/project';
      jest.mocked(mockConfigService.get<'webIdeProjectPath'>).mockReturnValue(webIdeProjectPath);

      const result = await service.getProjectByFileURI();

      expect(mockConfigService.get<'webIdeProjectPath'>).toHaveBeenCalledWith('webIdeProjectPath');
      expect(mockGitLabApiService.fetchFromApi).toHaveBeenCalledWith({
        type: 'rest',
        path: `/api/v4/projects/${encodeURIComponent(webIdeProjectPath)}`,
        method: 'GET',
      });
      expect(result).toEqual({
        id: 123,
        namespaceWithPath: 'group/project',
        uri: 'https://gitlab.example.com/group/project',
      });
    });

    it('encodes project path with special characters', async () => {
      const webIdeProjectPath = 'group/project with spaces';
      jest.mocked(mockConfigService.get<'webIdeProjectPath'>).mockReturnValue(webIdeProjectPath);

      await service.getProjectByFileURI();

      expect(mockGitLabApiService.fetchFromApi).toHaveBeenCalledWith({
        type: 'rest',
        path: `/api/v4/projects/${encodeURIComponent(webIdeProjectPath)}`,
        method: 'GET',
      });
    });

    it('returns undefined and logs error when webIdeProjectPath is not provided', async () => {
      jest.mocked(mockConfigService.get<'webIdeProjectPath'>).mockReturnValue(undefined);

      const result = await service.getProjectByFileURI();

      expect(result).toBeUndefined();
      expect(mockLogger.error).toHaveBeenCalledWith(
        "Can't obtain project information in the web because 'webIdeProjectPath' client configuration was not provided.",
      );
      expect(mockGitLabApiService.fetchFromApi).not.toHaveBeenCalled();
    });

    it('returns undefined and logs error when API call fails', async () => {
      const webIdeProjectPath = 'group/project';
      const error = new Error('API error');
      jest.mocked(mockConfigService.get<'webIdeProjectPath'>).mockReturnValue(webIdeProjectPath);
      jest.mocked(mockGitLabApiService.fetchFromApi).mockRejectedValue(error);

      const result = await service.getProjectByFileURI();

      expect(result).toBeUndefined();
      expect(mockLogger.error).toHaveBeenCalledWith('Error when fetching project info', error);
    });

    it('handles empty string webIdeProjectPath', async () => {
      jest.mocked(mockConfigService.get<'webIdeProjectPath'>).mockReturnValue('');

      const result = await service.getProjectByFileURI();

      expect(result).toBeUndefined();
      expect(mockLogger.error).toHaveBeenCalledWith(
        "Can't obtain project information in the web because 'webIdeProjectPath' client configuration was not provided.",
      );
    });

    it('handles null webIdeProjectPath', async () => {
      jest.mocked(mockConfigService.get<'webIdeProjectPath'>).mockReturnValue(undefined);

      const result = await service.getProjectByFileURI();

      expect(result).toBeUndefined();
      expect(mockLogger.error).toHaveBeenCalledWith(
        "Can't obtain project information in the web because 'webIdeProjectPath' client configuration was not provided.",
      );
    });
  });
});
