import type { GitLabApiService } from '@gitlab-org/core';
import type { Logger } from '@gitlab-org/logging';
import { createMockLogger } from '@gitlab-org/webview/test_utils';
import { createFakePartial } from '@gitlab-org/test-utils';
import {
  DefaultIssueService,
  type IssueDetails,
  type IssueService,
  type RestIssueSearchResult,
} from './issue_service';

describe('DefaultIssueService', () => {
  let service: IssueService;
  let mockGitLabApiService: GitLabApiService;
  let mockLogger: Logger;

  beforeEach(() => {
    mockLogger = createMockLogger();
    mockGitLabApiService = createFakePartial<GitLabApiService>({
      fetchFromApi: jest.fn(),
    });
    service = new DefaultIssueService(mockLogger, mockGitLabApiService);
  });

  describe('searchIssues', () => {
    const mockIssues: RestIssueSearchResult[] = [
      createFakePartial<RestIssueSearchResult>({ id: 1, title: 'Issue 1' }),
      createFakePartial<RestIssueSearchResult>({ id: 2, title: 'Issue 2' }),
      createFakePartial<RestIssueSearchResult>({ id: 3, title: 'Issue 3' }),
    ];

    beforeEach(() => {
      jest.mocked(mockGitLabApiService.fetchFromApi).mockResolvedValue(mockIssues);
    });

    it('should call GitLabApiService with correct parameters', async () => {
      await service.searchIssues('test');

      expect(mockGitLabApiService.fetchFromApi).toHaveBeenCalledWith({
        type: 'rest',
        method: 'GET',
        path: '/api/v4/search',
        searchParams: {
          scope: 'issues',
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
        const results = await service.searchIssues(searchTerm, limit);

        expect(results).toHaveLength(expectedResults);
        expect(results).toEqual(mockIssues.slice(0, expectedResults));
      },
    );

    it('should use default limit of 25 when not specified', async () => {
      const manyIssues = Array.from({ length: 30 }, (_, i) =>
        createFakePartial<RestIssueSearchResult>({ id: i, title: `Issue ${i}` }),
      );
      jest.mocked(mockGitLabApiService.fetchFromApi).mockResolvedValue(manyIssues);

      const results = await service.searchIssues('test');

      expect(results).toHaveLength(25);
    });

    it('should throw an error when API call fails', async () => {
      const errorMessage = 'API error';
      jest.mocked(mockGitLabApiService.fetchFromApi).mockRejectedValue(new Error(errorMessage));

      await expect(service.searchIssues('test')).rejects.toThrow(errorMessage);
    });
  });

  describe('getCurrentUsersIssues', () => {
    const mockIssues: RestIssueSearchResult[] = [
      createFakePartial<RestIssueSearchResult>({ id: 1, title: 'Issue 1' }),
      createFakePartial<RestIssueSearchResult>({ id: 2, title: 'Issue 2' }),
      createFakePartial<RestIssueSearchResult>({ id: 3, title: 'Issue 3' }),
    ];

    beforeEach(() => {
      jest
        .mocked(mockGitLabApiService.fetchFromApi)
        .mockResolvedValue({ issues: { nodes: mockIssues } });
    });

    it('should call GitLabApiService with correct parameters', async () => {
      await service.getCurrentUsersIssues();

      expect(mockGitLabApiService.fetchFromApi).toHaveBeenCalledWith({
        type: 'rest',
        method: 'GET',
        path: '/api/v4/issues',
        searchParams: {
          order_by: 'updated_at',
          per_page: '25',
          scope: 'assigned_to_me',
          sort: 'desc',
          state: 'opened',
        },
      });
    });

    it.each`
      limit        | expectedResults
      ${2}         | ${2}
      ${5}         | ${5}
      ${undefined} | ${25}
    `('should limit results to $expectedResults', async ({ limit, expectedResults }) => {
      await service.getCurrentUsersIssues(limit);

      expect(mockGitLabApiService.fetchFromApi).toHaveBeenCalledWith(
        expect.objectContaining({
          searchParams: expect.objectContaining({
            per_page: expectedResults.toString(),
          }),
        }),
      );
    });

    it('should throw an error when API call fails', async () => {
      const errorMessage = 'API error';
      jest.mocked(mockGitLabApiService.fetchFromApi).mockRejectedValue(new Error(errorMessage));

      await expect(service.getCurrentUsersIssues()).rejects.toThrow(errorMessage);
    });
  });

  describe('getIssueDetails', () => {
    const mockIssueDetails = createFakePartial<IssueDetails>({
      title: 'Test Issue',
      description: 'Test description',
      state: 'opened',
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-02T00:00:00Z',
      closedAt: null,
      confidential: false,
      userNotesCount: 2,
      weight: 3,
      webUrl: 'https://example.com/group/project/-/issues/1',
      milestone: {
        title: 'Sprint 1',
      },
      assignees: {
        nodes: [{ username: 'user1' }, { username: 'user2' }],
      },
      labels: {
        nodes: [{ title: 'bug' }, { title: 'critical' }],
      },
      discussions: {
        nodes: [
          {
            notes: {
              nodes: [
                {
                  body: 'First comment',
                  author: { username: 'user1' },
                  createdAt: '2024-01-01T12:00:00Z',
                },
                {
                  body: 'Second comment',
                  author: { username: 'user2' },
                  createdAt: '2024-01-02T12:00:00Z',
                },
              ],
            },
          },
        ],
      },
    });

    it('should call GitLabApiService with correct GraphQL query', async () => {
      const issueId = 'gid://gitlab/Issue/1';
      jest.mocked(mockGitLabApiService.fetchFromApi).mockResolvedValue({ issue: mockIssueDetails });

      await service.getIssueDetails(issueId);

      expect(mockGitLabApiService.fetchFromApi).toHaveBeenCalledWith({
        type: 'graphql',
        query: expect.any(String),
        variables: {
          id: issueId,
        },
      });
    });

    it('should return formatted issue details', async () => {
      jest.mocked(mockGitLabApiService.fetchFromApi).mockResolvedValue({ issue: mockIssueDetails });

      const result = await service.getIssueDetails('gid://gitlab/Issue/1');

      expect(result).toEqual(mockIssueDetails);
      expect(result.title).toBe('Test Issue');
      expect(result.state).toBe('opened');
      expect(result.milestone?.title).toBe('Sprint 1');
      expect(result.assignees.nodes).toHaveLength(2);
      expect(result.labels.nodes).toHaveLength(2);
      expect(result.discussions.nodes[0].notes.nodes).toHaveLength(2);
    });

    it('should handle issues without optional fields', async () => {
      const minimalIssueDetails = createFakePartial<IssueDetails>({
        title: 'Minimal Issue',
        description: '',
        state: 'opened',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
        closedAt: null,
        confidential: false,
        userNotesCount: 0,
        weight: null,
        webUrl: 'https://exanmple.com/group/project/-/issues/2',
        milestone: null,
        assignees: { nodes: [] },
        labels: { nodes: [] },
        discussions: { nodes: [] },
      });

      jest
        .mocked(mockGitLabApiService.fetchFromApi)
        .mockResolvedValue({ issue: minimalIssueDetails });

      const result = await service.getIssueDetails('gid://gitlab/Issue/2');

      expect(result.milestone).toBeNull();
      expect(result.weight).toBeNull();
      expect(result.assignees.nodes).toHaveLength(0);
      expect(result.labels.nodes).toHaveLength(0);
      expect(result.discussions.nodes).toHaveLength(0);
    });

    it('should handle closed issues', async () => {
      const closedIssueDetails = {
        ...mockIssueDetails,
        state: 'closed',
        closedAt: '2024-01-03T00:00:00Z',
      };

      jest
        .mocked(mockGitLabApiService.fetchFromApi)
        .mockResolvedValue({ issue: closedIssueDetails });

      const result = await service.getIssueDetails('gid://gitlab/Issue/3');

      expect(result.state).toBe('closed');
      expect(result.closedAt).toBe('2024-01-03T00:00:00Z');
    });

    it('should throw an error when API call fails', async () => {
      const errorMessage = 'API error';
      jest.mocked(mockGitLabApiService.fetchFromApi).mockRejectedValue(new Error(errorMessage));

      await expect(service.getIssueDetails('gid://gitlab/Issue/1')).rejects.toThrow(errorMessage);
    });
  });
});
