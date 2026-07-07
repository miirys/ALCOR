import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { DuoWorkflowInfo } from '@gitlab-org/graphql';
import { WorkflowFilter } from '@gitlab-lsp/workflow-api';
import * as DuoAgentPlatformMessageBusModule from '../services/DuoAgentPlatformMessageBus';
import { getMockPageInfo, MOCK_WORKFLOWS, MOCK_WORKFLOWS_EDGES } from '../mockData';
import { useHistoryStore } from './historyStore';

// Mock the message bus module
vi.mock('../services/DuoAgentPlatformMessageBus', () => ({
  getDuoAgentPlatformMessageBus: vi.fn(),
  disposeDuoAgentPlatformMessageBus: vi.fn(),
}));

interface MockMessageBus {
  sendRequest: ReturnType<typeof vi.fn>;
}

describe('History Store', () => {
  let mockMessageBus: MockMessageBus = {
    sendRequest: vi.fn(),
  };
  let historyStore: ReturnType<typeof useHistoryStore>;

  beforeEach(async () => {
    setActivePinia(createPinia());

    mockMessageBus = {
      sendRequest: vi.fn(),
    };

    vi.mocked(DuoAgentPlatformMessageBusModule.getDuoAgentPlatformMessageBus).mockReturnValue(
      mockMessageBus as never,
    );

    historyStore = useHistoryStore();
    await historyStore.initialize();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('initialize', () => {
    it('initializes the message bus on first call', async () => {
      // initialization happens in the beforeEach call
      expect(DuoAgentPlatformMessageBusModule.getDuoAgentPlatformMessageBus).toHaveBeenCalledOnce();
    });

    it('does not reinitialize if already initialized', async () => {
      // initialization happens in the beforeEach call

      // attempt to reinitialize
      await historyStore.initialize();

      expect(DuoAgentPlatformMessageBusModule.getDuoAgentPlatformMessageBus).toHaveBeenCalledOnce();
    });
  });

  describe('dispose', () => {
    it('disposes the message bus', async () => {
      await historyStore.dispose();
      expect(DuoAgentPlatformMessageBusModule.disposeDuoAgentPlatformMessageBus).toHaveBeenCalled();
    });
  });

  describe('$reset', () => {
    it('resets all state to initial values', async () => {
      mockMessageBus.sendRequest.mockResolvedValueOnce({
        duoWorkflowWorkflows: {
          pageInfo: getMockPageInfo(),
          edges: MOCK_WORKFLOWS_EDGES,
        },
      });

      await historyStore.getChatThreads();
      expect(historyStore.chats).toHaveLength(MOCK_WORKFLOWS.length);

      historyStore.$reset();

      // Verify states are reset
      expect(historyStore.areChatsLoading).toBe(false);
      expect(historyStore.chats).toEqual([]);
      expect(historyStore.error).toBeNull();
      expect(historyStore.pageInfo).toBeUndefined();
    });
  });

  describe('getChatThreads', () => {
    it('returns error when message bus is not initialized', async () => {
      setActivePinia(createPinia());
      const newStore = useHistoryStore();

      const result = await newStore.getChatThreads();

      expect(result.success).toBe(false);
      expect(result.error).toBe('Message bus not initialized');
    });

    it('gets chat threads', async () => {
      mockMessageBus.sendRequest.mockResolvedValueOnce({
        duoWorkflowWorkflows: {
          pageInfo: getMockPageInfo(),
          edges: MOCK_WORKFLOWS_EDGES,
        },
      });

      await historyStore.getChatThreads();

      expect(mockMessageBus.sendRequest).toHaveBeenCalledWith('getUserWorkflows', {
        type: WorkflowFilter.FOUNDATIONAL_CHAT_AGENTS,
        before: null,
        after: null,
        first: 20,
        last: null,
        search: null,
      });
      expect(historyStore.chats).toEqual(MOCK_WORKFLOWS);
    });

    it('sets loading state during fetch', async () => {
      const promise = historyStore.getChatThreads();

      expect(historyStore.areChatsLoading).toBe(true);

      mockMessageBus.sendRequest.mockResolvedValueOnce({
        duoWorkflowWorkflows: {
          pageInfo: getMockPageInfo(),
          edges: MOCK_WORKFLOWS_EDGES,
        },
      });

      await promise;

      expect(historyStore.areChatsLoading).toBe(false);
    });

    it('handles fetch errors and sets error state', async () => {
      mockMessageBus.sendRequest.mockRejectedValueOnce(new Error('Network Error'));

      const result = await historyStore.getChatThreads();

      expect(result.success).toBe(false);
      expect(historyStore.error?.type).toBe('load');
      expect(historyStore.error?.message).toBe('Network Error');
      expect(historyStore.areChatsLoading).toBe(false);
    });

    it('clears previous errors on successful fetch', async () => {
      // simluate an error
      mockMessageBus.sendRequest.mockRejectedValueOnce(new Error('Network Error'));
      const errorResult = await historyStore.getChatThreads();
      expect(historyStore.error?.type).toBe('load');
      expect(historyStore.error?.message).toBe('Network Error');
      expect(errorResult.success).toBe(false);

      // simluate successful fetch
      mockMessageBus.sendRequest.mockResolvedValueOnce({
        duoWorkflowWorkflows: {
          pageInfo: getMockPageInfo(),
          edges: MOCK_WORKFLOWS_EDGES,
        },
      });
      const result = await historyStore.getChatThreads();

      expect(historyStore.error).toBeNull();
      expect(result.success).toBe(true);
    });

    describe('Filtering workflows', () => {
      it('filters out dangling pre-created workflows', async () => {
        const precreatedDanglingWorkflow: DuoWorkflowInfo = {
          humanStatus: 'created',
          goal: 'how',
          latestCheckpoint: null,
          workflowDefinition: 'duo_chat_test/v1',
          id: 'test',
          aiCatalogItemVersionId: null,
          updatedAt: '2025-12-15T21:39:47Z',
          project: {
            id: 'gid://gitlab/Project/1',
            fullPath: 'gitlab/Project',
          },
          archived: false,
        };

        const workflows = [...MOCK_WORKFLOWS_EDGES, { node: precreatedDanglingWorkflow }];

        mockMessageBus.sendRequest.mockResolvedValueOnce({
          duoWorkflowWorkflows: {
            pageInfo: getMockPageInfo(),
            edges: workflows,
          },
        });

        await historyStore.getChatThreads();
        expect(historyStore.chats).toEqual(MOCK_WORKFLOWS);
      });
      it('filters out archived workflows', async () => {
        const archivedWorkflow: DuoWorkflowInfo = {
          id: 'gid://gitlab/Ai::DuoWorkflows::Workflow/archived',
          humanStatus: 'input required',
          updatedAt: '2025-12-15T21:39:47Z',
          goal: 'Archived workflow',
          archived: true,
          workflowDefinition: '',
          aiCatalogItemVersionId: 'gid://gitlab/Ai::Catalog::ItemVersion/1',
          project: {
            id: 'gid://gitlab/Project/1',
            fullPath: 'gitlab/Project',
          },
          latestCheckpoint: {
            duoMessages: [
              {
                content: 'test',
                messageType: 'user',
                toolInfo: null,
              },
            ],
          },
        };

        const workflows = [...MOCK_WORKFLOWS_EDGES, { node: archivedWorkflow }];

        mockMessageBus.sendRequest.mockResolvedValueOnce({
          duoWorkflowWorkflows: {
            pageInfo: getMockPageInfo(),
            edges: workflows,
          },
        });

        await historyStore.getChatThreads();

        expect(historyStore.chats).toEqual(MOCK_WORKFLOWS);
        expect(historyStore.chats).not.toContainEqual(archivedWorkflow);
      });

      describe('hasNextPage update logic', () => {
        it('sets hasNextPage to false when all workflows are filtered out', async () => {
          const danglingWorkflow: DuoWorkflowInfo = {
            humanStatus: 'created',
            workflowDefinition: '',
            goal: 'ab',
            latestCheckpoint: null,
            id: 'gid://gitlab/Ai::DuoWorkflows::Workflow/dangling',
            aiCatalogItemVersionId: null,
            updatedAt: '2025-12-15T21:39:47Z',
            archived: false,
            project: {
              id: 'gid://gitlab/Project/1',
              fullPath: 'gitlab/Project',
            },
          };

          const archivedWorkflow: DuoWorkflowInfo = {
            id: 'gid://gitlab/Ai::DuoWorkflows::Workflow/archived',
            humanStatus: 'input required',
            updatedAt: '2025-12-15T21:39:47Z',
            goal: 'Archived workflow',
            workflowDefinition: '',
            archived: true,
            aiCatalogItemVersionId: 'gid://gitlab/Ai::Catalog::ItemVersion/1',
            project: {
              id: 'gid://gitlab/Project/1',
              fullPath: 'gitlab/Project',
            },
            latestCheckpoint: {
              duoMessages: [
                {
                  content: 'test',
                  messageType: 'user',
                  toolInfo: null,
                },
              ],
            },
          };

          mockMessageBus.sendRequest.mockResolvedValueOnce({
            duoWorkflowWorkflows: {
              pageInfo: getMockPageInfo({ hasNextPage: true }),
              edges: [{ node: danglingWorkflow }, { node: archivedWorkflow }],
            },
          });

          await historyStore.getChatThreads();

          expect(historyStore.pageInfo?.hasNextPage).toBe(false);
          expect(historyStore.chats).toHaveLength(0);
        });

        it('preserves hasNextPage when workflows remain after filtering', async () => {
          const danglingWorkflow: DuoWorkflowInfo = {
            humanStatus: 'created',
            goal: 'ab',
            workflowDefinition: '',
            latestCheckpoint: null,
            id: 'gid://gitlab/Ai::DuoWorkflows::Workflow/dangling',
            aiCatalogItemVersionId: null,
            updatedAt: '2025-12-15T21:39:47Z',
            project: {
              id: 'gid://gitlab/Project/1',
              fullPath: 'gitlab/Project',
            },
            archived: false,
          };

          const workflows = [...MOCK_WORKFLOWS_EDGES, { node: danglingWorkflow }];

          mockMessageBus.sendRequest.mockResolvedValueOnce({
            duoWorkflowWorkflows: {
              pageInfo: getMockPageInfo({ hasNextPage: true }),
              edges: workflows,
            },
          });

          await historyStore.getChatThreads();

          expect(historyStore.pageInfo?.hasNextPage).toBe(true);
          expect(historyStore.chats).toHaveLength(MOCK_WORKFLOWS.length);
        });
      });
    });

    describe('with search', () => {
      it('searches for workflows with the given search term', async () => {
        const searchTerm = 'CI pipeline';

        await historyStore.getChatThreads({ search: searchTerm });

        expect(mockMessageBus.sendRequest).toHaveBeenCalledWith('getUserWorkflows', {
          type: WorkflowFilter.FOUNDATIONAL_CHAT_AGENTS,
          before: null,
          after: null,
          first: 20,
          last: null,
          search: searchTerm,
        });
      });

      it('search term is persisted after a deletion', async () => {
        const searchTerm = 'CI pipeline';
        mockMessageBus.sendRequest.mockResolvedValueOnce({
          duoWorkflowWorkflows: {
            pageInfo: getMockPageInfo(),
            edges: MOCK_WORKFLOWS_EDGES,
          },
        });

        await historyStore.getChatThreads({ search: searchTerm });

        expect(mockMessageBus.sendRequest).toHaveBeenCalledWith('getUserWorkflows', {
          type: WorkflowFilter.FOUNDATIONAL_CHAT_AGENTS,
          before: null,
          after: null,
          first: 20,
          last: null,
          search: searchTerm,
        });

        mockMessageBus.sendRequest.mockResolvedValueOnce({
          deleteDuoWorkflowsWorkflow: { success: true, errors: [] },
        });

        await historyStore.deleteWorkflow('test');

        // verify last getUserWorkflows is called with search
        expect(mockMessageBus.sendRequest).toHaveBeenLastCalledWith('deleteWorkflow', {
          workflowId: 'test',
        });
      });
    });
  });

  describe('deleteWorkflow', () => {
    it('returns error when message bus is not initialized', async () => {
      setActivePinia(createPinia());
      const newStore = useHistoryStore();

      const result = await newStore.deleteWorkflow('workflow-id');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Message bus not initialized');
    });

    it('deletes a workflow', async () => {
      mockMessageBus.sendRequest.mockResolvedValueOnce({
        deleteDuoWorkflowsWorkflow: { success: true, errors: [] },
      });

      const result = await historyStore.deleteWorkflow(MOCK_WORKFLOWS[0]!.id);

      expect(result.success).toBe(true);

      expect(mockMessageBus.sendRequest.mock.calls[0]).toEqual([
        'deleteWorkflow',
        {
          workflowId: MOCK_WORKFLOWS[0]!.id,
        },
      ]);
    });

    it('handles errors during deletion', async () => {
      const errorMessage = 'Failed to delete workflow';
      mockMessageBus.sendRequest.mockRejectedValue(new Error(errorMessage));

      const result = await historyStore.deleteWorkflow('workflow-id');

      expect(result.success).toBe(false);
      expect(historyStore.error?.message).toBe(errorMessage);
      expect(historyStore.error?.type).toBe('delete');
    });

    it('handles non-Error exceptions during deletion', async () => {
      mockMessageBus.sendRequest.mockRejectedValue('Unknown error');

      const result = await historyStore.deleteWorkflow('workflow-id');

      expect(result.success).toBe(false);
      expect(historyStore.error?.message).toBe('Unknown error');
      expect(historyStore.error?.type).toBe('delete');
    });

    it('clears previous errors on successful deletion', async () => {
      // simluate an error
      mockMessageBus.sendRequest.mockRejectedValueOnce(new Error('Network Error'));
      const errorResult = await historyStore.deleteWorkflow('1');
      expect(historyStore.error?.message).toBe('Network Error');
      expect(historyStore.error?.type).toBe('delete');
      expect(errorResult.success).toBe(false);

      mockMessageBus.sendRequest.mockResolvedValueOnce({
        deleteDuoWorkflowsWorkflow: { success: true, errors: [] },
      });
      await historyStore.deleteWorkflow('1');

      expect(historyStore.error).toBeNull();
    });
  });

  describe('Infinite scrolling', () => {
    it.each([
      { append: true, expected: MOCK_WORKFLOWS.length + 1, description: 'can append workflows' },
      {
        append: false,
        expected: 1,
        description: 'reset to latest fetched workflows',
      },
    ])('getChatThreads $description', async ({ append, expected }) => {
      // initial fetch of workflows
      mockMessageBus.sendRequest.mockResolvedValueOnce({
        duoWorkflowWorkflows: {
          pageInfo: getMockPageInfo({ hasNextPage: true }),
          edges: MOCK_WORKFLOWS_EDGES,
        },
      });

      const nextPageInfo = {
        startCursor: 'cursor2',
        endCursor: 'cursor3',
        hasNextPage: false,
        hasPreviousPage: false,
      };

      await historyStore.getChatThreads();

      const extraWorkflow = {
        id: 'gid://gitlab/Ai::DuoWorkflows::Workflow/123',
        projectId: 'gid://gitlab/Project/1',
        humanStatus: 'input required',
        updatedAt: '2025-12-15T21:39:47Z',
        goal: 'How do I make my CI pipelines run faster?',
        archived: false,
        aiCatalogItemVersionId: 'gid://gitlab/Ai::Catalog::ItemVersion/1',
        latestCheckpoint: {
          duoMessages: [
            {
              content: 'How do I make my CI pipelines run faster?',
              messageType: 'user',
            },
          ],
        },
      };

      mockMessageBus.sendRequest.mockResolvedValueOnce({
        duoWorkflowWorkflows: {
          pageInfo: nextPageInfo,
          edges: [
            {
              node: extraWorkflow,
            },
          ],
        },
      });

      await historyStore.getChatThreads({ append });

      expect(historyStore.chats.length).toEqual(expected);
    });
  });
});
