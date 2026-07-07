import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { TestLogger } from '@gitlab-org/logging';
import { createFakePartial } from '@gitlab-org/test-utils';
import { WorkflowFilter, WorkflowRunner } from '@gitlab-lsp/workflow-api';
import type {
  DuoWorkflowEdge,
  DuoWorkflowInfo,
  PaginationInfo,
  DuoWorkflowData,
} from '@gitlab-org/graphql';
import type { ToolInputFormatterService } from '../tool_input_formatter';
import { GitLabSessionDataService } from './session_data_service';

function createWorkflow(overrides: Partial<DuoWorkflowInfo> = {}): DuoWorkflowInfo {
  return {
    id: 'gid://gitlab/DuoWorkflows::Workflow/1',
    aiCatalogItemVersionId: null,
    project: null,
    humanStatus: 'running',
    updatedAt: '2026-02-23T12:00:00Z',
    goal: 'Help me refactor the auth module',
    workflowDefinition: 'duo_chat_test/v1',
    latestCheckpoint: {
      duoMessages: [
        { content: 'Help me refactor the auth module', messageType: 'user', toolInfo: null },
        { content: 'I will help you refactor.', messageType: 'assistant', toolInfo: null },
        { content: 'read_file result', messageType: 'tool', toolInfo: '{}' },
        { content: 'Here are my suggestions.', messageType: 'assistant', toolInfo: null },
      ],
    },
    archived: false,
    ...overrides,
  };
}

function createEdge(workflow: DuoWorkflowInfo): DuoWorkflowEdge {
  return { node: workflow };
}

function createPageInfo(overrides: Partial<PaginationInfo> = {}): PaginationInfo {
  return {
    hasNextPage: false,
    hasPreviousPage: false,
    endCursor: '',
    startCursor: '',
    ...overrides,
  };
}

function createGraphqlResponse(
  edges: DuoWorkflowEdge[] | null,
  pageInfo: PaginationInfo = createPageInfo(),
): DuoWorkflowData {
  return {
    duoWorkflowWorkflows: {
      edges,
      pageInfo,
    },
  };
}

describe('GitLabSessionDataService', () => {
  describe('getSessionHistory', () => {
    let service: GitLabSessionDataService;
    let mockGetGraphqlData: jest.Mock<() => Promise<DuoWorkflowData>>;

    beforeEach(() => {
      mockGetGraphqlData = jest.fn();

      const mockWorkflowRunner = createFakePartial<WorkflowRunner>({
        getGraphqlData: mockGetGraphqlData as WorkflowRunner['getGraphqlData'],
      });

      const mockToolInputFormatterService = createFakePartial<ToolInputFormatterService>({
        formatToolInput: jest
          .fn<() => Promise<{ tool: 'generic'; name: string; args: Record<string, unknown> }>>()
          .mockResolvedValue({
            tool: 'generic',
            name: 'test',
            args: {},
          }),
      });

      service = new GitLabSessionDataService(
        new TestLogger(),
        mockWorkflowRunner,
        mockToolInputFormatterService,
      );
    });

    describe('when workflows are returned', () => {
      it('maps workflow data to SessionListItem', async () => {
        const workflow = createWorkflow();
        mockGetGraphqlData.mockResolvedValue(createGraphqlResponse([createEdge(workflow)]));

        const result = await service.getSessionHistory({});

        expect(result.items).toEqual([
          {
            id: '1',
            title: 'Help me refactor the auth module',
            status: 'running',
            lastActivity: '2026-02-23T12:00:00Z',
            lastMessagePreview: 'Here are my suggestions.',
          },
        ]);
      });

      describe('when goal is null', () => {
        it('uses "Untitled session" as the title', async () => {
          mockGetGraphqlData.mockResolvedValue(
            createGraphqlResponse([createEdge(createWorkflow({ goal: null }))]),
          );

          const result = await service.getSessionHistory({});

          expect(result.items[0].title).toBe('Untitled session');
        });
      });

      describe('when latestCheckpoint is null', () => {
        it('returns undefined for lastMessage', async () => {
          mockGetGraphqlData.mockResolvedValue(
            createGraphqlResponse([
              createEdge(createWorkflow({ latestCheckpoint: null, humanStatus: 'completed' })),
            ]),
          );

          const result = await service.getSessionHistory({});

          expect(result.items[0].lastMessagePreview).toBeUndefined();
        });
      });

      describe('when the last message is a tool call', () => {
        it('formats it as a human-readable tool name', async () => {
          const workflow = createWorkflow({
            latestCheckpoint: {
              duoMessages: [
                { content: 'user msg', messageType: 'user', toolInfo: null },
                {
                  content: 'tool output',
                  messageType: 'tool',
                  toolInfo: '{"name":"read_file"}',
                },
              ],
            },
          });
          mockGetGraphqlData.mockResolvedValue(createGraphqlResponse([createEdge(workflow)]));

          const result = await service.getSessionHistory({});

          expect(result.items[0].lastMessagePreview).toBe('Used tool: read_file');
        });

        describe('when toolInfo is not valid JSON', () => {
          it('falls back to generic label', async () => {
            const workflow = createWorkflow({
              latestCheckpoint: {
                duoMessages: [
                  { content: 'tool output', messageType: 'tool', toolInfo: 'not-json' },
                ],
              },
            });
            mockGetGraphqlData.mockResolvedValue(createGraphqlResponse([createEdge(workflow)]));

            const result = await service.getSessionHistory({});

            expect(result.items[0].lastMessagePreview).toBe('Used tool');
          });
        });
      });
    });

    describe('when filtering workflows', () => {
      describe('when a workflow is archived', () => {
        it('excludes it from results', async () => {
          const active = createWorkflow({ id: 'gid://gitlab/DuoWorkflows::Workflow/100' });
          const archived = createWorkflow({
            id: 'gid://gitlab/DuoWorkflows::Workflow/200',
            archived: true,
          });

          mockGetGraphqlData.mockResolvedValue(
            createGraphqlResponse([createEdge(active), createEdge(archived)]),
          );

          const result = await service.getSessionHistory({});

          expect(result.items).toHaveLength(1);
          expect(result.items[0].id).toBe('100');
        });
      });

      describe('when a workflow is a dangling empty workflow', () => {
        it('excludes workflows with no checkpoint and goal <= 3 chars regardless of status', async () => {
          const real = createWorkflow({ id: 'gid://gitlab/DuoWorkflows::Workflow/300' });
          const danglingCreated = createWorkflow({
            id: 'gid://gitlab/DuoWorkflows::Workflow/301',
            latestCheckpoint: null,
            humanStatus: 'created',
            goal: '',
          });
          const danglingFailed = createWorkflow({
            id: 'gid://gitlab/DuoWorkflows::Workflow/302',
            latestCheckpoint: null,
            humanStatus: 'failed',
            goal: '',
          });
          const danglingShortGoal = createWorkflow({
            id: 'gid://gitlab/DuoWorkflows::Workflow/303',
            latestCheckpoint: null,
            humanStatus: 'created',
            goal: 'abc',
          });

          mockGetGraphqlData.mockResolvedValue(
            createGraphqlResponse([
              createEdge(real),
              createEdge(danglingCreated),
              createEdge(danglingFailed),
              createEdge(danglingShortGoal),
            ]),
          );

          const result = await service.getSessionHistory({});

          expect(result.items).toHaveLength(1);
          expect(result.items[0].id).toBe('300');
        });

        it('keeps workflows with goal > 3 chars even if no checkpoint', async () => {
          const realSession = createWorkflow({
            id: 'gid://gitlab/DuoWorkflows::Workflow/400',
            latestCheckpoint: null,
            humanStatus: 'created',
            goal: 'Help me with something',
          });

          mockGetGraphqlData.mockResolvedValue(createGraphqlResponse([createEdge(realSession)]));

          const result = await service.getSessionHistory({});

          expect(result.items).toHaveLength(1);
          expect(result.items[0].id).toBe('400');
        });

        it('keeps workflows with a checkpoint even if goal is empty', async () => {
          const sessionWithCheckpoint = createWorkflow({
            id: 'gid://gitlab/DuoWorkflows::Workflow/500',
            goal: '',
            humanStatus: 'failed',
          });

          mockGetGraphqlData.mockResolvedValue(
            createGraphqlResponse([createEdge(sessionWithCheckpoint)]),
          );

          const result = await service.getSessionHistory({});

          expect(result.items).toHaveLength(1);
          expect(result.items[0].id).toBe('500');
        });
      });
    });

    describe('when edges is null', () => {
      it('returns empty items', async () => {
        mockGetGraphqlData.mockResolvedValue(createGraphqlResponse(null));

        const result = await service.getSessionHistory({});

        expect(result.items).toEqual([]);
      });
    });

    describe('pagination', () => {
      it('passes pageInfo through correctly', async () => {
        const pageInfo = createPageInfo({
          hasNextPage: true,
          hasPreviousPage: true,
          endCursor: 'end-abc',
          startCursor: 'start-xyz',
        });
        mockGetGraphqlData.mockResolvedValue(createGraphqlResponse([], pageInfo));

        const result = await service.getSessionHistory({});

        expect(result.pageInfo).toEqual({
          hasNextPage: true,
          hasPreviousPage: true,
          endCursor: 'end-abc',
          startCursor: 'start-xyz',
        });
      });

      it('converts empty cursor strings to undefined', async () => {
        const pageInfo = createPageInfo({ endCursor: '', startCursor: '' });
        mockGetGraphqlData.mockResolvedValue(createGraphqlResponse([], pageInfo));

        const result = await service.getSessionHistory({});

        expect(result.pageInfo.endCursor).toBeUndefined();
        expect(result.pageInfo.startCursor).toBeUndefined();
      });
    });

    describe('GraphQL variables', () => {
      describe('when no options are provided', () => {
        it('defaults pageSize to 50', async () => {
          mockGetGraphqlData.mockResolvedValue(createGraphqlResponse([]));

          await service.getSessionHistory({});

          expect(mockGetGraphqlData).toHaveBeenCalledWith({
            operationName: 'duoWorkflows',
            query: null,
            variables: expect.objectContaining({
              type: WorkflowFilter.FOUNDATIONAL_CHAT_AGENTS,
              first: 50,
              last: null,
              after: null,
              before: null,
              search: null,
            }),
            signal: undefined,
          });
        });
      });

      describe('when custom options are provided', () => {
        describe('when navigating forward', () => {
          it('passes pageSize as first', async () => {
            mockGetGraphqlData.mockResolvedValue(createGraphqlResponse([]));

            await service.getSessionHistory({
              pageSize: 10,
              afterCursor: 'cursor-after',
              search: 'refactor',
            });

            expect(mockGetGraphqlData).toHaveBeenCalledWith({
              operationName: 'duoWorkflows',
              query: null,
              variables: expect.objectContaining({
                first: 10,
                last: null,
                after: 'cursor-after',
                before: null,
                search: 'refactor',
              }),
              signal: undefined,
            });
          });
        });

        describe('when navigating backward', () => {
          it('passes pageSize as last', async () => {
            mockGetGraphqlData.mockResolvedValue(createGraphqlResponse([]));

            await service.getSessionHistory({
              pageSize: 10,
              beforeCursor: 'cursor-before',
              search: 'refactor',
            });

            expect(mockGetGraphqlData).toHaveBeenCalledWith({
              operationName: 'duoWorkflows',
              query: null,
              variables: expect.objectContaining({
                first: null,
                last: 10,
                after: null,
                before: 'cursor-before',
                search: 'refactor',
              }),
              signal: undefined,
            });
          });
        });

        describe('when a signal is provided', () => {
          it('passes the signal through to getGraphqlData', async () => {
            const abortController = new AbortController();
            mockGetGraphqlData.mockResolvedValue(createGraphqlResponse([]));

            await service.getSessionHistory({ signal: abortController.signal });

            expect(mockGetGraphqlData).toHaveBeenCalledWith(
              expect.objectContaining({ signal: abortController.signal }),
            );
          });
        });
      });
    });
  });
});
