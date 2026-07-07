import type { GitLabApiService } from '@gitlab-org/core';
import type { Logger } from '@gitlab-org/logging';
import { createMockLogger } from '@gitlab-org/webview/test_utils';
import { Repository, RepositoryService } from '@gitlab-org/repositories';
import { createFakePartial } from '@gitlab-org/test-utils';
import {
  DefaultMergeRequestService,
  type MergeRequestDetails,
  type MergeRequestService,
  type RestMergeRequestSearchResult,
} from './merge_request_service';

describe('DefaultMergeRequestService', () => {
  let service: MergeRequestService;
  let mockGitLabApiService: GitLabApiService;
  let mockRepositoryService: RepositoryService;
  let mockLogger: Logger;

  beforeEach(() => {
    mockLogger = createMockLogger();
    mockGitLabApiService = createFakePartial<GitLabApiService>({
      fetchFromApi: jest.fn(),
    });
    mockRepositoryService = createFakePartial<RepositoryService>({
      getRepositoryForActiveDocument: jest.fn(),
    });

    service = new DefaultMergeRequestService(
      mockLogger,
      mockGitLabApiService,
      mockRepositoryService,
    );
  });

  describe('searchMergeRequests', () => {
    const mockMergeRequests: RestMergeRequestSearchResult[] = [
      createFakePartial<RestMergeRequestSearchResult>({ id: 1, title: 'MR 1' }),
      createFakePartial<RestMergeRequestSearchResult>({ id: 2, title: 'MR 2' }),
      createFakePartial<RestMergeRequestSearchResult>({ id: 3, title: 'MR 3' }),
    ];

    beforeEach(() => {
      jest.mocked(mockGitLabApiService.fetchFromApi).mockResolvedValue(mockMergeRequests);
    });

    it('should call GitLabApiService with correct parameters', async () => {
      await service.searchMergeRequests('test');

      expect(mockGitLabApiService.fetchFromApi).toHaveBeenCalledWith({
        type: 'rest',
        method: 'GET',
        path: '/api/v4/search',
        searchParams: {
          scope: 'merge_requests',
          search: 'test',
          fields: 'title',
        },
      });
    });

    it.each`
      searchTerm   | limit        | expectedResults
      ${'test'}    | ${2}         | ${2}
      ${'another'} | ${5}         | ${3}
      ${'query'}   | ${undefined} | ${3}
    `(
      'should return correct number of results for "$searchTerm" with limit $limit',
      async ({ searchTerm, limit, expectedResults }) => {
        const results = await service.searchMergeRequests(searchTerm, limit);

        expect(results).toHaveLength(expectedResults);
        expect(results).toEqual(mockMergeRequests.slice(0, expectedResults));
      },
    );

    it('should use default limit of 25 when not specified', async () => {
      const manyMergeRequests = Array.from({ length: 30 }, (_, i) =>
        createFakePartial<RestMergeRequestSearchResult>({ id: i, title: `MR ${i}` }),
      );
      jest.mocked(mockGitLabApiService.fetchFromApi).mockResolvedValue(manyMergeRequests);

      const results = await service.searchMergeRequests('test');

      expect(results).toHaveLength(25);
    });

    it('should throw an error when API call fails', async () => {
      const errorMessage = 'API error';
      jest.mocked(mockGitLabApiService.fetchFromApi).mockRejectedValue(new Error(errorMessage));

      await expect(service.searchMergeRequests('test')).rejects.toThrow(errorMessage);
    });
  });

  describe('getCurrentUsersMergeRequests', () => {
    const mockMergeRequests: RestMergeRequestSearchResult[] = [
      createFakePartial<RestMergeRequestSearchResult>({ id: 1, title: 'MR 1' }),
      createFakePartial<RestMergeRequestSearchResult>({ id: 2, title: 'MR 2' }),
      createFakePartial<RestMergeRequestSearchResult>({ id: 3, title: 'MR 3' }),
    ];

    beforeEach(() =>
      jest.mocked(mockGitLabApiService.fetchFromApi).mockResolvedValue(mockMergeRequests),
    );

    it('should call GitLabApiService with correct parameters', async () => {
      await service.getCurrentUsersMergeRequests();

      expect(mockGitLabApiService.fetchFromApi).toHaveBeenCalledWith({
        type: 'rest',
        method: 'GET',
        path: '/api/v4/merge_requests',
        searchParams: {
          scope: 'assigned_to_me',
          state: 'opened',
          order_by: 'updated_at',
          sort: 'desc',
          per_page: '25',
        },
      });
    });

    it('should respect provided limit parameter', async () => {
      const limit = 10;
      await service.getCurrentUsersMergeRequests(limit);

      expect(mockGitLabApiService.fetchFromApi).toHaveBeenCalledWith(
        expect.objectContaining({
          searchParams: expect.objectContaining({
            per_page: limit.toString(),
          }),
        }),
      );
    });

    it('should return merge requests from API', async () => {
      const results = await service.getCurrentUsersMergeRequests();

      expect(results).toEqual(mockMergeRequests);
    });

    it('should throw an error when API call fails', async () => {
      const errorMessage = 'API error';
      jest.mocked(mockGitLabApiService.fetchFromApi).mockRejectedValue(new Error(errorMessage));

      await expect(service.getCurrentUsersMergeRequests()).rejects.toThrow(errorMessage);
    });
  });

  describe('getMergeRequestDetails', () => {
    const mockMergeRequestDetails = createFakePartial<MergeRequestDetails>({
      title: 'Test MR',
      description: 'Test description',
      state: 'opened',
      commits: {
        nodes: [
          {
            diffs: [
              {
                oldPath: 'old/path',
                newPath: 'new/path',
                diff: '@@ -1,1 +1,1 @@',
              },
            ],
          },
        ],
      },
      discussions: {
        nodes: [
          {
            notes: {
              nodes: [
                {
                  body: 'Test comment',
                  author: { username: 'user1' },
                  createdAt: '2023-01-01T00:00:00Z',
                },
              ],
            },
          },
        ],
      },
    });

    beforeEach(() => {
      jest
        .mocked(mockGitLabApiService.fetchFromApi)
        .mockResolvedValue({ mergeRequest: mockMergeRequestDetails });
    });

    it('should call GitLabApiService with correct parameters', async () => {
      const mergeRequestId = 'gid://gitlab/MergeRequest/1';

      await service.getMergeRequestDetails(mergeRequestId);

      expect(mockGitLabApiService.fetchFromApi).toHaveBeenCalledWith({
        type: 'graphql',
        query: expect.stringContaining('getMergeRequestDetails'),
        variables: {
          id: mergeRequestId,
        },
      });
    });

    it('should return merge request details from API', async () => {
      const mergeRequestId = 'gid://gitlab/MergeRequest/1';

      const result = await service.getMergeRequestDetails(mergeRequestId);

      expect(result).toEqual(mockMergeRequestDetails);
    });

    it('should throw an error when API call fails', async () => {
      const mergeRequestId = 'gid://gitlab/MergeRequest/1';
      const errorMessage = 'API error';
      jest.mocked(mockGitLabApiService.fetchFromApi).mockRejectedValue(new Error(errorMessage));

      await expect(service.getMergeRequestDetails(mergeRequestId)).rejects.toThrow(errorMessage);
    });
  });

  describe('getMergeRequestForCurrentBranch', () => {
    const mockMergeRequests: RestMergeRequestSearchResult[] = [
      createFakePartial<RestMergeRequestSearchResult>({ id: 1, title: 'MR 1' }),
      createFakePartial<RestMergeRequestSearchResult>({ id: 2, title: 'MR 2' }),
    ];

    const mockRepository = createFakePartial<Repository>({
      getTrackingBranchName: jest.fn(),
      getMainBranch: jest.fn(),
    });

    beforeEach(() => {
      jest
        .mocked(mockRepositoryService.getRepositoryForActiveDocument)
        .mockReturnValue(mockRepository);
      jest.mocked(mockRepository.getTrackingBranchName).mockResolvedValue('feature-branch');
      jest.mocked(mockRepository.getMainBranch).mockResolvedValue('main');
      jest.mocked(mockGitLabApiService.fetchFromApi).mockResolvedValue(mockMergeRequests);
    });

    describe('when repository is not available', () => {
      beforeEach(() => {
        jest
          .mocked(mockRepositoryService.getRepositoryForActiveDocument)
          .mockReturnValue(undefined);
      });

      it('should return empty array when no repository is found', async () => {
        const results = await service.getMergeRequestForCurrentBranch();

        expect(results).toEqual([]);
      });
    });

    describe('when branch information is unavailable', () => {
      it('should return empty array when current branch cannot be determined', async () => {
        jest.mocked(mockRepository.getTrackingBranchName).mockResolvedValue('');

        const results = await service.getMergeRequestForCurrentBranch();

        expect(results).toEqual([]);
      });
    });

    describe('when fetching merge requests succeeds', () => {
      it('should search API with correct parameters', async () => {
        const results = await service.getMergeRequestForCurrentBranch();

        expect(mockGitLabApiService.fetchFromApi).toHaveBeenCalledWith({
          type: 'rest',
          method: 'GET',
          path: '/api/v4/merge_requests',
          searchParams: {
            state: 'opened',
            source_branch: 'feature-branch',
          },
        });

        expect(results).toEqual(mockMergeRequests);
      });

      describe('with limit parameter', () => {
        const manyMergeRequests = Array.from({ length: 30 }, (_, i) =>
          createFakePartial<RestMergeRequestSearchResult>({ id: i, title: `MR ${i}` }),
        );

        beforeEach(() => {
          jest.mocked(mockGitLabApiService.fetchFromApi).mockResolvedValue(manyMergeRequests);
        });

        it('should respect provided limit parameter', async () => {
          const results = await service.getMergeRequestForCurrentBranch(5);

          expect(results).toHaveLength(5);
        });
      });
    });

    describe('when API call fails', () => {
      beforeEach(() => {
        const errorMessage = 'API error';
        jest.mocked(mockGitLabApiService.fetchFromApi).mockRejectedValue(new Error(errorMessage));
      });

      it('should throw an error', async () => {
        await expect(service.getMergeRequestForCurrentBranch()).rejects.toThrow('API error');
      });
    });
  });
});
