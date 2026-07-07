import { createFakePartial } from '@gitlab-org/test-utils';
import {
  AbstractAIContextProvider,
  IssueAIContextItem,
  IssueMetadata,
} from '@gitlab-org/ai-context';
import { Logger, TestLogger } from '@gitlab-org/logging';
import { DuoProjectAccessChecker } from '../../services/duo_access';
import { DuoProjectStatus } from '../../services/duo_access/project_access_checker';
import { IssueService, type IssueDetails, type RestIssueSearchResult } from '../../services/gitlab';
import type { IssueContextProvider } from './issue';
import { DefaultIssueContextProvider } from './issue';
import { formatIssuableHeader, formatIssuableNotes } from './format_issueables';

jest.mock('./format_issueables', () => ({
  formatIssuableHeader: jest.fn().mockReturnValue('formatted header'),
  formatIssuableNotes: jest.fn().mockReturnValue('formatted notes'),
}));

jest.mock('../../utils/async_debounce', () => ({
  asyncDebounce: jest.fn((fn) => fn),
}));

describe('IssueContextProvider', () => {
  let issueProvider: IssueContextProvider;
  let mockIssueService: IssueService;
  let mockDuoProjectAccessChecker: DuoProjectAccessChecker;
  let logger: Logger;

  beforeEach(() => {
    logger = new TestLogger();
    mockDuoProjectAccessChecker = createFakePartial<DuoProjectAccessChecker>({
      checkProjectStatusesByIds: jest.fn(),
    });
    mockIssueService = createFakePartial<IssueService>({
      searchIssues: jest.fn(),
      getCurrentUsersIssues: jest.fn(),
      getIssueDetails: jest.fn(),
    });

    issueProvider = new DefaultIssueContextProvider(
      logger,
      mockIssueService,
      mockDuoProjectAccessChecker,
    );
  });

  it('correctly creates an issueProvider instance with the `issue` type', () => {
    expect(issueProvider).toBeInstanceOf(DefaultIssueContextProvider);
    expect(issueProvider).toBeInstanceOf(AbstractAIContextProvider);
    expect(issueProvider.type).toBe('issue');
  });

  describe('searchContextItems', () => {
    it('calls getCurrentUsersIssues when query is empty', async () => {
      jest.mocked(mockIssueService.getCurrentUsersIssues).mockResolvedValue([]);
      jest.mocked(mockDuoProjectAccessChecker.checkProjectStatusesByIds).mockResolvedValue({});

      await issueProvider.searchContextItems({
        category: 'issue',
        query: '',
        workspaceFolders: [],
      });

      expect(mockIssueService.getCurrentUsersIssues).toHaveBeenCalledTimes(1);
    });

    it('calls searchIssues with correct parameters when query is not empty', async () => {
      jest.mocked(mockIssueService.searchIssues).mockResolvedValue([]);
      jest.mocked(mockDuoProjectAccessChecker.checkProjectStatusesByIds).mockResolvedValue({});

      await issueProvider.searchContextItems({
        category: 'issue',
        query: 'test',
        workspaceFolders: [],
      });

      expect(mockIssueService.searchIssues).toHaveBeenCalledTimes(1);
      expect(mockIssueService.searchIssues).toHaveBeenCalledWith('test', 25);
    });

    it.each([
      { duoEnabled: true, expectedEnabled: true, expectedDisabledReasons: [] },
      { duoEnabled: false, expectedEnabled: false, expectedDisabledReasons: ['project disabled'] },
    ])(
      'handles DuoProjectStatus correctly (enabled: $duoEnabled)',
      async ({ duoEnabled, expectedEnabled, expectedDisabledReasons }) => {
        const projectId = 1;
        const mockIssue = createFakePartial<RestIssueSearchResult>({
          id: 1,
          project_id: projectId,
          title: 'Test Issue',
          web_url: 'https://gitlab.com/test/project/-/issues/1',
        });

        jest.mocked(mockIssueService.searchIssues).mockResolvedValue([mockIssue]);
        jest.mocked(mockDuoProjectAccessChecker.checkProjectStatusesByIds).mockResolvedValue({
          [projectId]: duoEnabled ? DuoProjectStatus.DuoEnabled : DuoProjectStatus.DuoDisabled,
        });

        const results = await issueProvider.searchContextItems({
          category: 'issue',
          query: 'test',
          workspaceFolders: [],
        });

        expect(results).toHaveLength(1);
        expect(results[0].metadata.enabled).toBe(expectedEnabled);
        expect(results[0].metadata.disabledReasons).toEqual(expectedDisabledReasons);
      },
    );

    it('maps result to expected context item structure', async () => {
      const projectId = 1;
      const mockIssue = createFakePartial<RestIssueSearchResult>({
        id: 1,
        iid: 11,
        project_id: projectId,
        title: 'Test Issue',
        web_url: 'https://gitlab.com/test/project/-/issues/1',
      });

      jest.mocked(mockIssueService.searchIssues).mockResolvedValue([mockIssue]);
      jest.mocked(mockDuoProjectAccessChecker.checkProjectStatusesByIds).mockResolvedValue({
        [projectId]: DuoProjectStatus.DuoEnabled,
      });

      const results = await issueProvider.searchContextItems({
        category: 'issue',
        query: 'test',
        workspaceFolders: [],
      });

      expect(results[0]).toMatchObject({
        id: 'gid://gitlab/Issue/1',
        category: 'issue',
        metadata: {
          enabled: true,
          disabledReasons: [],
          subType: 'issue',
          subTypeLabel: 'Issue',
          icon: 'issues',
          title: 'Test Issue',
          secondaryText: 'test/project#11',
          webUrl: 'https://gitlab.com/test/project/-/issues/1',
        },
      });
    });

    it('limits search results to 25 items', async () => {
      const mockIssues = Array.from({ length: 30 }, (_, i) =>
        createFakePartial<RestIssueSearchResult>({
          id: i + 1,
          project_id: i + 1,
          title: `Test Issue ${i + 1}`,
          web_url: `https://gitlab.com/test/project/-/issues/${i + 1}`,
        }),
      );

      jest.mocked(mockIssueService.searchIssues).mockResolvedValue(mockIssues);
      jest
        .mocked(mockDuoProjectAccessChecker.checkProjectStatusesByIds)
        .mockResolvedValue(
          Object.fromEntries(
            mockIssues.map((issue) => [issue.project_id, DuoProjectStatus.DuoEnabled]),
          ),
        );

      const results = await issueProvider.searchContextItems({
        category: 'issue',
        query: 'test',
        workspaceFolders: [],
      });

      expect(results).toHaveLength(25);
    });

    it('handles search service errors gracefully', async () => {
      jest.mocked(mockIssueService.searchIssues).mockRejectedValue(new Error('Search failed'));

      const results = await issueProvider.searchContextItems({
        category: 'issue',
        query: 'test',
        workspaceFolders: [],
      });

      expect(results).toEqual([]);
    });
  });

  describe('retrieveSelectedContextItemsWithContent', () => {
    it('returns the added items unmodified', async () => {
      const item = createFakePartial<IssueAIContextItem>({
        id: 'gid://gitlab/Issue/1234',
        metadata: createFakePartial<IssueMetadata>({ subType: 'issue' }),
      });
      const item2 = createFakePartial<IssueAIContextItem>({
        id: 'gid://gitlab/Issue/5678',
        metadata: createFakePartial<IssueMetadata>({ subType: 'issue' }),
      });

      await issueProvider.addSelectedContextItem(item);
      await issueProvider.addSelectedContextItem(item2);

      const result = await issueProvider.retrieveContextItemsWithContent();

      expect(result).toEqual([item, item2]);
    });
  });

  describe('getItemWithContent', () => {
    const mockIssueDetails = createFakePartial<IssueDetails>({
      title: 'Test Issue',
      state: 'opened',
      description: 'Test description',
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-02T00:00:00Z',
      closedAt: null,
      confidential: false,
      userNotesCount: 2,
      weight: 3,
      webUrl: 'https://gitlab.com/group/project/-/issues/1',
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
              ],
            },
          },
        ],
      },
    });

    const item = createFakePartial<IssueAIContextItem>({
      id: 'gid://gitlab/Issue/1234',
      category: 'issue',
      metadata: createFakePartial<IssueMetadata>({
        subType: 'issue',
        subTypeLabel: 'Issue',
      }),
    });

    it('returns item as-is if content already exists', async () => {
      const itemWithContent = { ...item, content: 'existing content' };
      const result = await issueProvider.getItemWithContent(itemWithContent);

      expect(result).toBe(itemWithContent);
      expect(mockIssueService.getIssueDetails).not.toHaveBeenCalled();
    });

    it('fetches and formats content for item without content', async () => {
      jest.mocked(mockIssueService.getIssueDetails).mockResolvedValue(mockIssueDetails);

      const result = await issueProvider.getItemWithContent(item);

      expect(result.content).toContain('Milestone: Sprint 1');
      expect(result.content).toContain('Assignees: user1, user2');
      expect(result.content).toContain('Labels: bug, critical');
      expect(result.content).toContain('Weight: 3');
    });

    it('returns item without content when fetch fails', async () => {
      jest
        .mocked(mockIssueService.getIssueDetails)
        .mockRejectedValue(new Error('Failed to get Issue'));

      const result = await issueProvider.getItemWithContent(item);

      expect(result).toBe(item);
      expect(result.content).toBeUndefined();
    });

    describe('content formatting', () => {
      it('includes all essential issue information', async () => {
        const mockIssueWithAllFields = createFakePartial<IssueDetails>({
          title: 'Test Issue Title',
          state: 'opened',
          description: 'Test description with **markdown**',
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-02T00:00:00Z',
          closedAt: null,
          confidential: true,
          webUrl: 'https://gitlab.com/group/project/-/issues/1',
          milestone: { title: 'Sprint 1' },
          assignees: { nodes: [{ username: 'user1' }] },
          labels: { nodes: [{ title: 'bug' }] },
          weight: 5,
          discussions: { nodes: [] },
        });

        jest.mocked(mockIssueService.getIssueDetails).mockResolvedValue(mockIssueWithAllFields);

        const result = await issueProvider.getItemWithContent(item);

        const expectedContent = [
          'Confidential: true',
          'Milestone: Sprint 1',
          'Assignees: user1',
          'Labels: bug',
          'Weight: 5',
          'Created: 2024-01-01T00:00:00Z',
          'Updated: 2024-01-02T00:00:00Z',
          'Comments:',
        ];

        expectedContent.forEach((line) => {
          expect(result.content).toContain(line);
        });
      });

      it('handles issues with minimal fields', async () => {
        const minimalIssue = createFakePartial<IssueDetails>({
          title: 'Minimal Issue',
          state: 'opened',
          description: '',
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:00Z',
          closedAt: null,
          confidential: false,
          webUrl: 'https://gitlab.com/group/project/-/issues/1',
          milestone: null,
          assignees: { nodes: [] },
          labels: { nodes: [] },
          weight: null,
          discussions: { nodes: [] },
        });

        jest.mocked(mockIssueService.getIssueDetails).mockResolvedValue(minimalIssue);

        const result = await issueProvider.getItemWithContent(item);
        const content = result.content!;

        expect(content).not.toContain('Confidential:');
        expect(content).not.toContain('Milestone:');
        expect(content).not.toContain('Assignees:');
        expect(content).not.toContain('Labels:');
        expect(content).not.toContain('Weight:');
      });

      it('calls formatIssuableHeader with correct parameters', async () => {
        jest.mocked(mockIssueService.getIssueDetails).mockResolvedValue(mockIssueDetails);

        const result = await issueProvider.getItemWithContent(item);

        expect(formatIssuableHeader).toHaveBeenCalledWith(mockIssueDetails, 'Issue');

        expect(result.content).toContain('formatted header');
      });

      it('calls formatIssuableNotes with correct parameters', async () => {
        jest.mocked(mockIssueService.getIssueDetails).mockResolvedValue(mockIssueDetails);

        const result = await issueProvider.getItemWithContent(item);

        expect(formatIssuableNotes).toHaveBeenCalledWith(
          mockIssueDetails.discussions.nodes.flatMap((d) => d.notes.nodes),
          expect.any(Number),
        );

        expect(result.content).toContain('formatted note');
      });
    });
  });
});
