import { createFakePartial } from '@gitlab-org/test-utils';
import { GitLabGID } from '@gitlab-org/core';
import {
  AbstractAIContextProvider,
  MergeRequestAIContextItem,
  MergeRequestMetadata,
} from '@gitlab-org/ai-context';
import { Logger, TestLogger } from '@gitlab-org/logging';
import { DuoProjectAccessChecker } from '../../services/duo_access';
import { DuoProjectStatus } from '../../services/duo_access/project_access_checker';
import {
  type MergeRequestDetails,
  MergeRequestService,
  type RestMergeRequestSearchResult,
} from '../../services/gitlab';
import { getAdvancedContextContentLimit } from './utils';
import type { MergeRequestContextProvider } from './merge_request';
import { DefaultMergeRequestContextProvider } from './merge_request';
import { formatIssuableHeader, formatIssuableNotes } from './format_issueables';

jest.mock('./format_issueables', () => ({
  formatIssuableHeader: jest.fn().mockReturnValue('formatted header'),
  formatIssuableNotes: jest.fn().mockReturnValue('formatted notes'),
}));

jest.mock('../../utils/async_debounce', () => ({
  asyncDebounce: jest.fn((fn) => fn),
}));

jest.mock('./utils', () => ({
  getAdvancedContextContentLimit: jest.fn(() => 1000),
}));

describe('MergeRequestContextProvider', () => {
  let mergeRequestProvider: MergeRequestContextProvider;
  let mockMergeRequestService: MergeRequestService;
  let mockDuoProjectAccessChecker: DuoProjectAccessChecker;

  const mockMergeRequestDetails = createFakePartial<MergeRequestDetails>({
    title: 'Test MR',
    state: 'opened',
    description: 'Test description',
    commits: {
      nodes: [
        {
          diffs: [
            {
              oldPath: 'old/path',
              newPath: 'new/path',
              diff: 'test diff content',
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
                createdAt: '2024-01-01T00:00:00Z',
                author: {
                  username: 'test_author',
                },
              },
            ],
          },
        },
      ],
    },
  });

  let logger: Logger;

  beforeEach(() => {
    logger = new TestLogger();
    mockDuoProjectAccessChecker = createFakePartial<DuoProjectAccessChecker>({
      checkProjectStatusesByIds: jest.fn(),
    });
    mockMergeRequestService = createFakePartial<MergeRequestService>({
      searchMergeRequests: jest.fn(),
      getCurrentUsersMergeRequests: jest.fn(),
      getMergeRequestForCurrentBranch: jest.fn(),
      getMergeRequestDetails: jest.fn(),
    });

    mergeRequestProvider = new DefaultMergeRequestContextProvider(
      logger,
      mockDuoProjectAccessChecker,
      mockMergeRequestService,
    );
  });

  it('correctly creates a mergeRequestProvider instance with the `merge_request` type', () => {
    expect(mergeRequestProvider).toBeInstanceOf(DefaultMergeRequestContextProvider);
    expect(mergeRequestProvider).toBeInstanceOf(AbstractAIContextProvider);
    expect(mergeRequestProvider.type).toBe('merge_request');
  });

  describe('searchContextItems', () => {
    describe('with pre-selected items', () => {
      const alreadySelectedSearchResult = createFakePartial<RestMergeRequestSearchResult>({
        id: 1234,
        project_id: 9999,
      });
      const newSearchResult = createFakePartial<RestMergeRequestSearchResult>({
        id: 5678,
        project_id: 8888,
      });
      const selectedItem = createFakePartial<MergeRequestAIContextItem>({
        id: 'gid://gitlab/MergeRequest/1234',
        category: 'merge_request',
        metadata: createFakePartial<MergeRequestMetadata>({ subType: 'merge_request' }),
      });

      beforeEach(async () => {
        jest
          .mocked(mockDuoProjectAccessChecker.checkProjectStatusesByIds)
          .mockResolvedValue({ 8888: DuoProjectStatus.DuoEnabled });
        jest
          .mocked(mockMergeRequestService.searchMergeRequests)
          .mockResolvedValue([alreadySelectedSearchResult, newSearchResult]);
        await mergeRequestProvider.addSelectedContextItem(selectedItem);
      });

      it('excludes merge requests from results which have already been selected', async () => {
        const results = await mergeRequestProvider.searchContextItems({
          category: 'merge_request',
          query: 'test',
          workspaceFolders: [],
        });

        expect(results).toHaveLength(1);
        expect(results[0].id).toBe('gid://gitlab/MergeRequest/5678');
      });
    });

    describe('when search query is provided', () => {
      const projectId = 1;
      const mockMergeRequest = createFakePartial<RestMergeRequestSearchResult>({
        id: 1,
        iid: 2,
        project_id: projectId,
        title: 'Test MR',
        web_url: 'https://gitlab.com/test/project/-/merge_requests/1',
      });

      beforeEach(() => {
        jest
          .mocked(mockMergeRequestService.searchMergeRequests)
          .mockResolvedValue([mockMergeRequest]);
      });

      it('calls merge request service', async () => {
        jest.mocked(mockDuoProjectAccessChecker.checkProjectStatusesByIds).mockResolvedValue({});

        await mergeRequestProvider.searchContextItems({
          category: 'merge_request',
          query: 'test',
          workspaceFolders: [],
        });

        expect(mockMergeRequestService.searchMergeRequests).toHaveBeenCalledTimes(1);
        expect(mockMergeRequestService.searchMergeRequests).toHaveBeenCalledWith('test', 25);
      });

      it.each([
        { duoEnabled: true, expectedEnabled: true, expectedDisabledReasons: [] },
        {
          duoEnabled: false,
          expectedEnabled: false,
          expectedDisabledReasons: ['project disabled'],
        },
      ])(
        'handles DuoProjectStatus correctly (enabled: $duoEnabled)',
        async ({ duoEnabled, expectedEnabled, expectedDisabledReasons }) => {
          jest.mocked(mockDuoProjectAccessChecker.checkProjectStatusesByIds).mockResolvedValue({
            [projectId]: duoEnabled ? DuoProjectStatus.DuoEnabled : DuoProjectStatus.DuoDisabled,
          });

          const results = await mergeRequestProvider.searchContextItems({
            category: 'merge_request',
            query: 'test',
            workspaceFolders: [],
          });

          expect(results).toHaveLength(1);
          expect(results[0].metadata.enabled).toBe(expectedEnabled);
          expect(results[0].metadata.disabledReasons).toEqual(expectedDisabledReasons);
        },
      );

      describe('when DuoProjectStatus is enabled', () => {
        beforeEach(() => {
          jest
            .mocked(mockDuoProjectAccessChecker.checkProjectStatusesByIds)
            .mockImplementation((projectIds) => {
              return Promise.resolve(
                projectIds.reduce((acc, id) => ({ ...acc, [id]: DuoProjectStatus.DuoEnabled }), {}),
              );
            });
        });

        describe('when handling results', () => {
          it('maps result to expected context item structure', async () => {
            const results = await mergeRequestProvider.searchContextItems({
              category: 'merge_request',
              query: 'test',
              workspaceFolders: [],
            });

            expect(results[0]).toMatchObject({
              id: 'gid://gitlab/MergeRequest/1',
              category: 'merge_request',
              metadata: {
                enabled: true,
                disabledReasons: [],
                subType: 'merge_request',
                subTypeLabel: 'Merge request',
                title: 'Test MR',
                secondaryText: 'test/project!2',
                webUrl: 'https://gitlab.com/test/project/-/merge_requests/1',
              },
            });
          });

          it('limits search results to 25 items', async () => {
            const mockMergeRequests = Array.from({ length: 30 }, (_, i) =>
              createFakePartial<RestMergeRequestSearchResult>({
                id: i + 1,
                project_id: i + 1,
                title: `Test MR ${i + 1}`,
                web_url: `https://gitlab.com/test/project/-/merge_requests/${i + 1}`,
              }),
            );

            jest
              .mocked(mockMergeRequestService.searchMergeRequests)
              .mockResolvedValue(mockMergeRequests);

            const results = await mergeRequestProvider.searchContextItems({
              category: 'merge_request',
              query: 'test',
              workspaceFolders: [],
            });

            expect(results).toHaveLength(25);
          });
        });

        describe('when there is an error', () => {
          beforeEach(() => {
            jest
              .mocked(mockMergeRequestService.searchMergeRequests)
              .mockRejectedValue(new Error('Search failed'));
          });

          it('handles search service errors gracefully', async () => {
            const results = await mergeRequestProvider.searchContextItems({
              category: 'merge_request',
              query: 'test',
              workspaceFolders: [],
            });

            expect(results).toEqual([]);
          });
        });
      });
    });

    describe('when search query is empty', () => {
      let mockBranchMergeRequest: RestMergeRequestSearchResult;
      let mockUserMergeRequest: RestMergeRequestSearchResult;

      beforeEach(() => {
        mockBranchMergeRequest = createFakePartial<RestMergeRequestSearchResult>({
          id: 1111,
          iid: 2222,
          project_id: 1,
          title: 'Branch MR',
          web_url: 'https://gitlab.com/test/project/-/merge_requests/1111',
        });

        mockUserMergeRequest = createFakePartial<RestMergeRequestSearchResult>({
          id: 3333,
          iid: 4444,
          project_id: 2,
          title: 'User MR',
          web_url: 'https://gitlab.com/test/project/-/merge_requests/3333',
        });

        jest
          .mocked(mockMergeRequestService.getMergeRequestForCurrentBranch)
          .mockResolvedValue([mockBranchMergeRequest]);
        jest
          .mocked(mockMergeRequestService.getCurrentUsersMergeRequests)
          .mockResolvedValue([mockUserMergeRequest]);
        jest.mocked(mockDuoProjectAccessChecker.checkProjectStatusesByIds).mockResolvedValue({
          1: DuoProjectStatus.DuoEnabled,
          2: DuoProjectStatus.DuoEnabled,
        });
      });

      describe('when fetching merge requests succeeds', () => {
        it('fetches and combines MRs from current branch and user', async () => {
          const results = await mergeRequestProvider.searchContextItems({
            category: 'merge_request',
            query: '',
            workspaceFolders: [],
          });

          expect(mockMergeRequestService.getMergeRequestForCurrentBranch).toHaveBeenCalledWith(25);
          expect(mockMergeRequestService.getCurrentUsersMergeRequests).toHaveBeenCalledWith(25);
          expect(results).toHaveLength(2);
          expect(results.map((r) => r.metadata.title)).toEqual(['Branch MR', 'User MR']);
        });

        describe('when same MR appears in both results', () => {
          beforeEach(() => {
            jest
              .mocked(mockMergeRequestService.getMergeRequestForCurrentBranch)
              .mockResolvedValue([mockBranchMergeRequest]);
            jest
              .mocked(mockMergeRequestService.getCurrentUsersMergeRequests)
              .mockResolvedValue([mockBranchMergeRequest]);
          });

          it('deduplicates MRs that appear in both results', async () => {
            const results = await mergeRequestProvider.searchContextItems({
              category: 'merge_request',
              query: '',
              workspaceFolders: [],
            });

            expect(results).toHaveLength(1);
            expect(results[0].metadata.title).toBe('Branch MR');
          });
        });
      });

      describe('when handling fetch errors', () => {
        describe('when current branch MR fetch fails', () => {
          beforeEach(() => {
            jest
              .mocked(mockMergeRequestService.getMergeRequestForCurrentBranch)
              .mockRejectedValue(new Error('Branch MR fetch failed'));
          });

          it('handles errors from current branch MR fetch gracefully', async () => {
            const results = await mergeRequestProvider.searchContextItems({
              category: 'merge_request',
              query: '',
              workspaceFolders: [],
            });

            expect(results).toHaveLength(1);
            expect(results[0].metadata.title).toBe('User MR');
          });
        });

        describe('when user MR fetch fails', () => {
          beforeEach(() => {
            jest
              .mocked(mockMergeRequestService.getCurrentUsersMergeRequests)
              .mockRejectedValue(new Error('User MR fetch failed'));
          });

          it('handles errors from user MR fetch gracefully', async () => {
            const results = await mergeRequestProvider.searchContextItems({
              category: 'merge_request',
              query: '',
              workspaceFolders: [],
            });

            expect(results).toHaveLength(1);
            expect(results[0].metadata.title).toBe('Branch MR');
          });
        });

        describe('when both fetches fail', () => {
          beforeEach(() => {
            jest
              .mocked(mockMergeRequestService.getMergeRequestForCurrentBranch)
              .mockRejectedValue(new Error('Branch MR fetch failed'));
            jest
              .mocked(mockMergeRequestService.getCurrentUsersMergeRequests)
              .mockRejectedValue(new Error('User MR fetch failed'));
          });

          it('returns empty array if both fetches fail', async () => {
            const results = await mergeRequestProvider.searchContextItems({
              category: 'merge_request',
              query: '',
              workspaceFolders: [],
            });

            expect(results).toEqual([]);
          });
        });
      });

      describe('when handling DuoProjectStatus', () => {
        beforeEach(() => {
          jest.mocked(mockDuoProjectAccessChecker.checkProjectStatusesByIds).mockResolvedValue({
            1: DuoProjectStatus.DuoEnabled,
            2: DuoProjectStatus.DuoDisabled,
          });
        });

        it('correctly maps MRs to context items with enabled status', async () => {
          const results = await mergeRequestProvider.searchContextItems({
            category: 'merge_request',
            query: '',
            workspaceFolders: [],
          });

          expect(results).toHaveLength(2);
          expect(results[0].metadata).toMatchObject({
            enabled: true,
            disabledReasons: [],
            title: 'Branch MR',
          });
          expect(results[1].metadata).toMatchObject({
            enabled: false,
            disabledReasons: ['project disabled'],
            title: 'User MR',
          });
        });
      });

      describe('when handling many results', () => {
        const manyMergeRequests = Array.from({ length: 30 }, (_, i) =>
          createFakePartial<RestMergeRequestSearchResult>({
            id: i + 1,
            project_id: i + 1,
            title: `MR ${i + 1}`,
            web_url: `https://gitlab.com/test/project/-/merge_requests/${i + 1}`,
          }),
        );

        beforeEach(() => {
          jest
            .mocked(mockMergeRequestService.getMergeRequestForCurrentBranch)
            .mockResolvedValue(manyMergeRequests);
          jest
            .mocked(mockMergeRequestService.getCurrentUsersMergeRequests)
            .mockResolvedValue(manyMergeRequests);
          jest
            .mocked(mockDuoProjectAccessChecker.checkProjectStatusesByIds)
            .mockResolvedValue(
              Object.fromEntries(
                manyMergeRequests.map((mr) => [mr.project_id, DuoProjectStatus.DuoEnabled]),
              ),
            );
        });

        it('limits combined results to 25 items', async () => {
          const results = await mergeRequestProvider.searchContextItems({
            category: 'merge_request',
            query: '',
            workspaceFolders: [],
          });

          expect(results).toHaveLength(25);
        });
      });
    });
  });

  describe('retrieveSelectedContextItemsWithContent', () => {
    const selectedItem = createFakePartial<MergeRequestAIContextItem>({
      id: 'gid://gitlab/MergeRequest/1234',
      category: 'merge_request',
      metadata: createFakePartial<MergeRequestMetadata>({
        subType: 'merge_request',
      }),
    });

    beforeEach(() => mergeRequestProvider.addSelectedContextItem(selectedItem));

    it('handles errors gracefully when retrieving content fails', async () => {
      jest
        .mocked(mockMergeRequestService.getMergeRequestDetails)
        .mockRejectedValue(new Error('Failed to get MR'));

      const results = await mergeRequestProvider.retrieveContextItemsWithContent();

      expect(results).toHaveLength(1);
      expect(results[0].content).toBeUndefined();
    });

    it('splits character limits for diffs and notes between attached MRs', async () => {
      jest.mocked(getAdvancedContextContentLimit).mockReturnValue(100);
      const expectedMaxChars = 25;

      const longDiff = 'a'.repeat(150);
      const longNote = 'b'.repeat(150);

      const mockMRWithLongContent1 = createFakePartial<MergeRequestDetails>({
        ...mockMergeRequestDetails,
        commits: {
          nodes: [
            {
              diffs: Array.from({ length: 3 }, (_, i) => ({
                oldPath: `file${i}.ts`,
                newPath: `file${i}.ts`,
                diff: longDiff,
              })),
            },
          ],
        },
        discussions: {
          nodes: [
            {
              notes: {
                nodes: Array.from({ length: 3 }, (_, i) => ({
                  body: longNote,
                  createdAt: `2024-01-0${i + 1}T00:00:00Z`,
                  author: { username: `user${i}` },
                })),
              },
            },
          ],
        },
      });
      const mockMRWithLongContent2 = {
        ...mockMRWithLongContent1,
      };
      await mergeRequestProvider.addSelectedContextItem(
        createFakePartial<MergeRequestAIContextItem>({
          id: `gid://gitlab/MergeRequest/1`,
          metadata: createFakePartial<MergeRequestMetadata>({
            subType: 'merge_request',
          }),
        }),
      );
      await mergeRequestProvider.addSelectedContextItem(
        createFakePartial<MergeRequestAIContextItem>({
          id: `gid://gitlab/MergeRequest/2`,
          metadata: createFakePartial<MergeRequestMetadata>({
            subType: 'merge_request',
          }),
        }),
      );

      jest
        .mocked(mockMergeRequestService.getMergeRequestDetails)
        .mockImplementation((id: GitLabGID) =>
          Promise.resolve(
            id === `gid://gitlab/MergeRequest/1` ? mockMRWithLongContent1 : mockMRWithLongContent2,
          ),
        );

      const results = await mergeRequestProvider.retrieveContextItemsWithContent();

      for (const result of results) {
        // Split content into diffs and notes sections
        const [, diffSection, noteSection] = result
          .content!.split(/(?:Changes:\n|Comments:\n)/)
          .map((section) => section.trim());

        expect(diffSection.length).toBeLessThanOrEqual(expectedMaxChars);
        expect(diffSection).toContain('file0.ts'); // should only include first diff due to limit
        expect(diffSection).not.toContain('file1.ts');

        expect(noteSection.length).toBeLessThanOrEqual(expectedMaxChars);
        expect(noteSection.split('\n\n').length).toBe(1); // Should only include first note due to limit
      }
    });
  });

  describe('getItemWithContent', () => {
    const item = createFakePartial<MergeRequestAIContextItem>({
      id: 'gid://gitlab/MergeRequest/1234',
      category: 'merge_request',
      metadata: createFakePartial<MergeRequestMetadata>({
        subType: 'merge_request',
        subTypeLabel: 'Merge request',
      }),
    });

    it('returns item as-is if content already exists', async () => {
      const itemWithContent = { ...item, content: 'existing content' };
      const result = await mergeRequestProvider.getItemWithContent(itemWithContent);

      expect(result).toBe(itemWithContent);
      expect(mockMergeRequestService.getMergeRequestDetails).not.toHaveBeenCalled();
    });

    it('returns item without content when fetch fails', async () => {
      jest
        .mocked(mockMergeRequestService.getMergeRequestDetails)
        .mockRejectedValue(new Error('Failed to get MR'));

      const result = await mergeRequestProvider.getItemWithContent(item);

      expect(result).toBe(item);
      expect(result.content).toBeUndefined();
    });

    describe('content formatting', () => {
      it('calls formatIssuableHeader with correct parameters', async () => {
        jest
          .mocked(mockMergeRequestService.getMergeRequestDetails)
          .mockResolvedValue(mockMergeRequestDetails);

        const result = await mergeRequestProvider.getItemWithContent(item);

        expect(formatIssuableHeader).toHaveBeenCalledWith(mockMergeRequestDetails, 'Merge request');

        expect(result.content).toContain('formatted header');
      });

      it('formats commit diffs correctly', async () => {
        jest.mocked(getAdvancedContextContentLimit).mockReturnValue(1000);
        const mockMRWithDiffs = createFakePartial<MergeRequestDetails>({
          ...mockMergeRequestDetails,
          commits: {
            nodes: [
              {
                diffs: [
                  {
                    oldPath: 'old/file.ts',
                    newPath: 'new/file.ts',
                    diff: '@@ -1,3 +1,3 @@\n-old line\n+new line\nunchanged',
                  },
                  {
                    oldPath: 'another/file.ts',
                    newPath: 'another/file.ts',
                    diff: '@@ -1 +1 @@\n-removed\n+added',
                  },
                ],
              },
            ],
          },
        });

        jest
          .mocked(mockMergeRequestService.getMergeRequestDetails)
          .mockResolvedValue(mockMRWithDiffs);

        const result = await mergeRequestProvider.getItemWithContent(item);

        expect(result.content).toContain('--- old/file.ts');
        expect(result.content).toContain('+++ new/file.ts');
        expect(result.content).toContain('-old line');
        expect(result.content).toContain('+new line');
        expect(result.content).toContain('unchanged');

        expect(result.content).toContain('--- another/file.ts');
        expect(result.content).toContain('+++ another/file.ts');
        expect(result.content).toContain('-removed');
        expect(result.content).toContain('+added');

        // Verify git diff headers were stripped
        expect(result.content).not.toContain('@@ -1,3 +1,3 @@');
        expect(result.content).not.toContain('@@ -1 +1 @@');
      });

      it('calls formatIssuableNotes with correct parameters', async () => {
        jest
          .mocked(mockMergeRequestService.getMergeRequestDetails)
          .mockResolvedValue(mockMergeRequestDetails);

        const result = await mergeRequestProvider.getItemWithContent(item);

        expect(formatIssuableNotes).toHaveBeenCalledWith(
          mockMergeRequestDetails.discussions.nodes.flatMap((d) => d.notes.nodes),
          expect.any(Number),
        );

        expect(result.content).toContain('formatted note');
      });
    });
  });
});
