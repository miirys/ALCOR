import type { Meta, StoryObj } from '@storybook/vue3-vite';

import { expect, fn, spyOn, waitFor } from 'storybook/test';
import { WorkflowFilter } from '@gitlab-lsp/workflow-api';
import FakeTimers from '@sinonjs/fake-timers';
import { DuoWorkflowEdge } from '@gitlab-org/graphql';
import piniaDecorator from '@/stories/piniaDecorator';
import vueRouterDecorator from '@/stories/vueRouterDecorator';
import { useHistoryStore } from '../stores/historyStore';
import { getMockPageInfo, MOCK_WORKFLOWS, MOCK_WORKFLOWS_EDGES } from '../mockData';
import { duoAgentPlatformRoutes } from '../router';
import { DuoAgentPlatformMessageBus } from '../services/DuoAgentPlatformMessageBus';
import Layout from '../Layout.vue';
import { useChatStore } from '../stores/chatStore';
import History from './History.vue';

const LayoutDecorator = () => ({
  components: { Layout },
  template: '<Layout><story/></Layout>',
});

const MOCK_MESSAGE_BUS: DuoAgentPlatformMessageBus = {
  sendRequest: fn(),
  sendNotification: fn(),
  onNotification: fn(),
  onRequest: fn(),
};

const fakeClock = FakeTimers.createClock();

const delayedResponse = <T>(data: T, delayMs: number = 500): Promise<T> =>
  new Promise((resolve) => {
    fakeClock.setTimeout(() => resolve(data), delayMs);
  });

const setupStore = (mockMessageBus?: DuoAgentPlatformMessageBus) => {
  const historyStore = useHistoryStore();
  historyStore.$reset();
  if (mockMessageBus) {
    historyStore.initialize(mockMessageBus);
  }
  return historyStore;
};

// helper functions to create the mocks
const createWorkflowNode = ({ id, goal }: { id: number; goal: string }): DuoWorkflowEdge => ({
  node: {
    id: `gid://gitlab/Ai::DuoWorkflows::Workflow/${id}`,
    aiCatalogItemVersionId: null,
    goal,
    archived: false,
    workflowDefinition: 'duo_chat_test/v1',
    humanStatus: 'created',
    updatedAt: '2025-12-12T21:00:00Z',
    latestCheckpoint: { duoMessages: [] },
    project: {
      id: 'gid://gitlab/Project/1',
      fullPath: 'gitlab/Project',
    },
  },
});

const mockWorkflowsResponse = (edges: ReturnType<typeof createWorkflowNode>[]) => ({
  duoWorkflowWorkflows: {
    pageInfo: getMockPageInfo(),
    edges,
  },
});

const createLoadParam = ({ search }: { search: string | null }) => ({
  type: WorkflowFilter.FOUNDATIONAL_CHAT_AGENTS,
  before: null,
  after: null,
  first: 20,
  last: null,
  search,
});

const meta = {
  title: 'duo-agent-platform/History',
  component: History,
  decorators: [piniaDecorator, LayoutDecorator, vueRouterDecorator(duoAgentPlatformRoutes)],
  parameters: {
    a11y: {
      test: 'todo',
    },
  },
  afterEach: () => {
    fakeClock.reset();
  },
} satisfies Meta<typeof History>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => ({
    components: { History },
    setup() {
      const historyStore = setupStore();
      historyStore.chats = [];
      const chatStore = useChatStore();
      chatStore.workflowId = 'id-1';
    },
    template: '<History/>',
  }),
};

export const Loading: Story = {
  render: () => ({
    components: { History },
    setup() {
      const historyStore = setupStore();
      historyStore.areChatsLoading = true;
    },
    template: '<History/>',
  }),
};

export const WithItems: Story = {
  render: () => ({
    components: { History },
    setup() {
      setupStore(MOCK_MESSAGE_BUS);
      spyOn(MOCK_MESSAGE_BUS, 'sendRequest').mockImplementationOnce(
        fn().mockResolvedValueOnce({
          duoWorkflowWorkflows: {
            pageInfo: getMockPageInfo(),
            edges: MOCK_WORKFLOWS_EDGES,
          },
        }),
      );
    },
    template: '<History/>',
  }),
  play: async ({ canvas, userEvent, step }) => {
    const getHistoryItems = async () => {
      const historyList = canvas.getByTestId('history-item-list');
      return historyList.querySelectorAll('li');
    };

    const getFirstDeleteButton = async () => {
      const deleteButtons = canvas.getAllByLabelText('Delete chat thread');
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      return deleteButtons[0]!;
    };

    const mockDeleteResponse = ({ success }: { success: boolean }) => {
      spyOn(MOCK_MESSAGE_BUS, 'sendRequest').mockImplementationOnce(() => {
        return delayedResponse(
          {
            deleteDuoWorkflowsWorkflow: {
              success,
              errors: success ? [] : ['error'],
              clientMutationId: null,
            },
          },
          300,
        );
      });
    };

    await step('Deletes an item', async () => {
      const items = await getHistoryItems();
      await expect(items).toHaveLength(MOCK_WORKFLOWS.length);
      const targetItem = items[0];

      mockDeleteResponse({ success: true });
      const deleteButton = await getFirstDeleteButton();
      await userEvent.click(deleteButton);
      await expect(canvas.getByLabelText('Loading')).toBeVisible();

      fakeClock.runAll();

      await waitFor(async () => {
        const updatedItems = await getHistoryItems();
        await expect(updatedItems.length).toBe(items.length - 1);
        await expect(targetItem).not.toBeVisible();
      });
    });

    await step('Shows delete error', async () => {
      const items = await getHistoryItems();
      const targetItem = items[0];

      mockDeleteResponse({ success: false });
      const deleteButton = await getFirstDeleteButton();
      await userEvent.click(deleteButton);

      fakeClock.runAll();

      await waitFor(async () => {
        const updatedItems = await getHistoryItems();
        await expect(updatedItems.length).toBe(items.length);
        await expect(targetItem).toBeVisible();
      });

      await expect(canvas.getByTestId('delete-error')).toBeVisible();
      await expect(canvas.getByLabelText('Retry deleting chat thread')).toBeVisible();
    });

    await step('Retry delete', async () => {
      const items = await getHistoryItems();
      const targetItem = items[0];

      mockDeleteResponse({ success: true });
      const retryButton = canvas.getByLabelText('Retry deleting chat thread');
      await userEvent.click(retryButton);

      fakeClock.runAll();

      await waitFor(async () => {
        const updatedItems = await getHistoryItems();
        await expect(updatedItems.length).toBe(items.length - 1);
        await expect(targetItem).not.toBeVisible();
      });
    });
  },
};

export const NoResultsFound: Story = {
  render: () => ({
    components: { History },
    setup() {
      const historyStore = setupStore();
      historyStore.searchTerm = 'nothing';
      historyStore.chats = [];
    },
    template: '<History/>',
  }),
};

export const SearchWithDebounce: Story = {
  render: () => ({
    components: { History },
    setup() {
      setupStore(MOCK_MESSAGE_BUS);
      spyOn(MOCK_MESSAGE_BUS, 'sendRequest').mockResolvedValueOnce(
        mockWorkflowsResponse([createWorkflowNode({ id: 1, goal: 'first chat' })]),
      );
    },
    template: '<History/>',
  }),
  play: async ({ canvas, userEvent, step }) => {
    const searchInput = canvas.getByPlaceholderText('Search history');

    await step('Type search term with debounce', async () => {
      // Type multiple characters rapidly
      await userEvent.type(searchInput, 'te');
      await userEvent.type(searchInput, 'st');

      spyOn(MOCK_MESSAGE_BUS, 'sendRequest').mockImplementationOnce(() => {
        return delayedResponse(
          mockWorkflowsResponse([createWorkflowNode({ id: 1, goal: 'Write unit tests' })]),
          300,
        );
      });

      await waitFor(async () => {
        await expect(searchInput).toHaveValue('test');
        // Wait for debounce to complete (500ms + buffer)
        await expect(MOCK_MESSAGE_BUS.sendRequest).toHaveBeenCalledWith(
          'getUserWorkflows',
          createLoadParam({ search: 'test' }),
        );
        fakeClock.tick(100);
        const loadingSkeletons = canvas.getAllByTestId('history-item-skeleton');
        await expect(loadingSkeletons).toBeDefined();
        fakeClock.runAll();
        await expect(canvas.findByText('Write unit tests')).resolves.toBeInTheDocument();
      });

      spyOn(MOCK_MESSAGE_BUS, 'sendRequest').mockImplementationOnce(() => {
        return delayedResponse(
          mockWorkflowsResponse([
            createWorkflowNode({ id: 2, goal: 'Write unit tests after debounced' }),
          ]),
          300,
        );
      });

      await userEvent.type(searchInput, ' after debounced');

      await waitFor(async () => {
        await expect(searchInput).toHaveValue('test after debounced');
        await expect(MOCK_MESSAGE_BUS.sendRequest).toHaveBeenCalledWith(
          'getUserWorkflows',
          createLoadParam({ search: 'test after debounced' }),
        );
        fakeClock.tick(100);
        const loadingSkeletons = canvas.getAllByTestId('history-item-skeleton');
        await expect(loadingSkeletons).toBeDefined();
        fakeClock.runAll();
        await expect(
          await canvas.findByText('Write unit tests after debounced'),
        ).toBeInTheDocument();
      });
    });

    await step('When no results found', async () => {
      spyOn(MOCK_MESSAGE_BUS, 'sendRequest').mockResolvedValueOnce(mockWorkflowsResponse([]));

      await userEvent.clear(searchInput);
      await userEvent.type(searchInput, 'nothing');

      await waitFor(async () => {
        await expect(searchInput).toHaveValue('nothing');
        await expect(MOCK_MESSAGE_BUS.sendRequest).toHaveBeenCalledWith(
          'getUserWorkflows',
          createLoadParam({ search: 'nothing' }),
        );
      });

      await expect(canvas.getByText('No results found')).toBeInTheDocument();
    });

    await step('Clear search triggers debounced load', async () => {
      spyOn(MOCK_MESSAGE_BUS, 'sendRequest').mockResolvedValueOnce(
        mockWorkflowsResponse([createWorkflowNode({ id: 1, goal: 'Write unit tests' })]),
      );

      await userEvent.clear(searchInput);

      await waitFor(async () => {
        await expect(searchInput).toHaveValue('');
        await expect(MOCK_MESSAGE_BUS.sendRequest).toHaveBeenCalledWith(
          'getUserWorkflows',
          createLoadParam({ search: null }),
        );
      });
    });
  },
};

export const Error: Story = {
  render: () => ({
    components: { History },
    setup() {
      setupStore(MOCK_MESSAGE_BUS);
      const initialError = fn().mockRejectedValueOnce('Error');

      // Configure the mock to reject on first call
      spyOn(MOCK_MESSAGE_BUS, 'sendRequest').mockImplementationOnce(initialError);
    },
    template: '<History/>',
  }),
  play: async ({ canvas, userEvent }) => {
    await expect(await canvas.findByText('Unable to Load Chat History')).toBeInTheDocument();

    // Then resolve on retry
    spyOn(MOCK_MESSAGE_BUS, 'sendRequest').mockImplementationOnce(() => {
      return delayedResponse(
        mockWorkflowsResponse([createWorkflowNode({ id: 1, goal: 'Write unit tests' })]),
        300,
      );
    });

    await userEvent.click(canvas.getByRole('button', { name: 'Retry loading chat history' }));

    const loadingSkeletons = canvas.getAllByTestId('history-item-skeleton');
    await expect(loadingSkeletons).toBeDefined();
    fakeClock.runAll();

    await expect(await canvas.findByText('Write unit tests')).toBeInTheDocument();

    // Manually setting error to render the error page in storybook UI
    const historyStore = useHistoryStore();
    historyStore.error = {
      type: 'load',
      message: 'Error fetching chat threads',
    };
  },
};
