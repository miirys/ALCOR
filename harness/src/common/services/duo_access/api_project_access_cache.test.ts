import { ApiReconfiguredData, toGitLabGid } from '@gitlab-org/core';
import { createFakePartial } from '@gitlab-org/test-utils';
import { GitLabApiClient } from '../../api';
import { GitLabProjectId } from '../../api_types';
import {
  DefaultDuoApiProjectAccessCache,
  DuoApiProjectAccessCache,
  DuoApiProjectAccessGqlResponse,
} from './api_project_access_cache';

describe('DefaultDuoApiProjectAccessCache', () => {
  let mockGitLabApiClient: GitLabApiClient;
  let duoApiProjectAccessCache: DuoApiProjectAccessCache;
  let onApiReconfiguredCallback: (data: ApiReconfiguredData) => void;

  const projectId = 123;
  const projectGid = toGitLabGid('Project', projectId);

  function mockApiResponse(id: GitLabProjectId, enabled: boolean) {
    jest.mocked(mockGitLabApiClient.fetchFromApi).mockResolvedValue({
      projects: {
        edges: [{ node: { id: toGitLabGid('Project', id), duoFeaturesEnabled: enabled } }],
      },
    } satisfies DuoApiProjectAccessGqlResponse);
  }

  beforeEach(() => {
    mockGitLabApiClient = createFakePartial<GitLabApiClient>({
      fetchFromApi: jest.fn(),
      onApiReconfigured: jest.fn().mockImplementation((listener) => {
        onApiReconfiguredCallback = listener;
        return { dispose: jest.fn() };
      }),
    });
    duoApiProjectAccessCache = new DefaultDuoApiProjectAccessCache(mockGitLabApiClient);
  });

  describe('populateCacheByIds', () => {
    describe('when a project is already cached', () => {
      beforeEach(async () => {
        mockApiResponse(projectId, true);
        await duoApiProjectAccessCache.getEnabledForProjects([projectId]);

        jest.mocked(mockGitLabApiClient.fetchFromApi).mockReset();
      });

      it('does not try to fetch the project again', async () => {
        await duoApiProjectAccessCache.getEnabledForProjects([projectId]);

        expect(mockGitLabApiClient.fetchFromApi).not.toHaveBeenCalled();
      });
    });

    describe('when a project is not yet cached', () => {
      beforeEach(() => {
        mockApiResponse(projectId, true);
      });

      it('makes network request for the Duo status', async () => {
        await duoApiProjectAccessCache.getEnabledForProjects([projectId]);

        expect(mockGitLabApiClient.fetchFromApi).toHaveBeenCalledTimes(1);
        expect(mockGitLabApiClient.fetchFromApi).toHaveBeenCalledWith(
          expect.objectContaining({
            variables: {
              projectIds: [projectGid],
            },
          }),
        );
      });

      it('returns "false" if the network request fails', async () => {
        jest.mocked(mockGitLabApiClient.fetchFromApi).mockRejectedValue(new Error('ruh roh'));

        const result = await duoApiProjectAccessCache.getEnabledForProjects([projectId]);

        expect(result).toMatchObject({ [projectId]: false });
      });

      describe('and the cache has other project statuses', () => {
        beforeEach(async () => {
          await duoApiProjectAccessCache.getEnabledForProjects([projectId]);
          jest.mocked(mockGitLabApiClient.fetchFromApi).mockReset();
        });

        it('does only requests Duo status for the missing project', async () => {
          const missingProjectId = 9876;
          const missingProjectGid = toGitLabGid('Project', missingProjectId);
          mockApiResponse(missingProjectId, true);

          await duoApiProjectAccessCache.getEnabledForProjects([projectId, missingProjectId]);

          expect(mockGitLabApiClient.fetchFromApi).toHaveBeenCalledTimes(1);
          expect(mockGitLabApiClient.fetchFromApi).toHaveBeenCalledWith(
            expect.objectContaining({
              variables: {
                projectIds: [missingProjectGid],
              },
            }),
          );
        });
      });
    });
  });

  describe('when API is reconfigured', () => {
    beforeEach(() => {
      mockApiResponse(projectId, true);
    });

    it('clears the cache', async () => {
      await duoApiProjectAccessCache.getEnabledForProjects([projectId]);
      expect(mockGitLabApiClient.fetchFromApi).toHaveBeenCalledTimes(1); // fetch
      await duoApiProjectAccessCache.getEnabledForProjects([projectId]);
      expect(mockGitLabApiClient.fetchFromApi).toHaveBeenCalledTimes(1); // use cached value

      onApiReconfiguredCallback(createFakePartial<ApiReconfiguredData>({}));

      await duoApiProjectAccessCache.getEnabledForProjects([projectId]);
      expect(mockGitLabApiClient.fetchFromApi).toHaveBeenCalledTimes(2); // re-fetch
    });
  });
});
