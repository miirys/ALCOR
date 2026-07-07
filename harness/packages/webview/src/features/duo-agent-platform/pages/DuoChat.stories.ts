import type { Meta, StoryObj } from '@storybook/vue3-vite';

import { expect, spyOn, waitFor, within } from 'storybook/test';
import type { AgentPlatformRepository } from '@gitlab-lsp/workflow-api';
import Layout from '../Layout.vue';
import { duoAgentPlatformRoutes } from '../router';
import { MOCK_DUO_MESSAGES } from '../mockData';
import {
  DuoAgentPlatformMessageBus,
  getDuoAgentPlatformMessageBus,
} from '../services/DuoAgentPlatformMessageBus';
import { useChat } from '../composables/useChat';
import { useHistoryStore } from '../stores/historyStore';
import { useChatStore } from '../stores/chatStore';
import { useRepositoriesStore } from '../stores/repositoriesStore';
import Message from '../components/messages/Message.vue';
import DuoChat from './DuoChat.vue';
import vueRouterDecorator from '@/stories/vueRouterDecorator';
import piniaDecorator from '@/stories/piniaDecorator';

const LayoutDecorator = () => ({
  components: { Layout },
  template: '<Layout><story/></Layout>',
});

const meta = {
  title: 'duo-agent-platform/Chat',
  component: DuoChat,
  decorators: [piniaDecorator, LayoutDecorator, vueRouterDecorator(duoAgentPlatformRoutes)],
  parameters: {
    a11y: {
      test: 'todo',
    },
  },
} satisfies Meta<typeof DuoChat>;

const setupStore = (mockMessageBus?: DuoAgentPlatformMessageBus) => {
  const historyStore = useHistoryStore();
  const activeChatStore = useChatStore();
  historyStore.$reset();
  if (mockMessageBus) {
    historyStore.initialize(mockMessageBus);
    activeChatStore.initialize(mockMessageBus);
  }
  const chat = useChat();
  return chat;
};

// Drive the health check to READY so DuoChat renders the chat instead of the loading
// skeleton: resolve the checkHealth request as enabled, seed a settled repository, and
// select it. Other requests stay pending, matching the disconnected Storybook bus.
const settleHealthyProject = () => {
  const bus = getDuoAgentPlatformMessageBus();
  spyOn(bus, 'sendRequest').mockImplementation((type) =>
    type === 'checkHealth' ? Promise.resolve({ enabled: true, checks: [] }) : new Promise(() => {}),
  );

  const repositories = useRepositoriesStore();
  repositories.repositories = [
    {
      rootFsPath: '/workspace',
      projects: [
        {
          namespaceWithPath: 'gitlab-org/gitlab',
          duoFeaturesEnabled: true,
          duoAgenticChatAvailable: true,
        },
      ],
    },
  ] as unknown as AgentPlatformRepository[];
  repositories.isLoading = false;
  repositories.selectedProjectPath = 'gitlab-org/gitlab';
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => ({
    components: { DuoChat },
    template: `<DuoChat/>`,
  }),
};

export const SuggestionSelected: Story = {
  render: () => ({
    components: { DuoChat },
    template: `<DuoChat/>`,
    setup: () => {
      setupStore();
      settleHealthyProject();
    },
  }),
  play: async ({ canvas, step, userEvent }) => {
    const suggestionButtons = await canvas.findAllByTestId(/^suggestion-button/);
    await expect(suggestionButtons.length).toBeGreaterThan(0);
    const textarea = canvas.getByRole<HTMLTextAreaElement>('textbox');

    await step('Click a suggestion', async () => {
      const firstSuggestionButton = suggestionButtons[0];
      await expect(firstSuggestionButton).toBeDefined();
      if (!firstSuggestionButton) return;
      const firstSuggestion =
        within(firstSuggestionButton).getByTestId('suggestion-prompt').textContent;

      await userEvent.click(firstSuggestionButton);

      // Wait for the textarea to be populated
      await waitFor(async () => {
        await expect(textarea.value).toBeTruthy();
      });

      // suggestion is populated in textarea
      await expect(textarea.value).toBe(firstSuggestion);
    });

    const secondSuggestionButton = suggestionButtons[1];
    await expect(secondSuggestionButton).toBeDefined();
    if (!secondSuggestionButton) return;
    const secondSuggestion =
      within(secondSuggestionButton).getByTestId('suggestion-prompt').textContent;

    await step('Click another suggestion', async () => {
      await userEvent.click(secondSuggestionButton);

      // new suggestion replaced the old one
      await expect(textarea.value).toBe(secondSuggestion);
    });

    await step('Type user input and click suggestion', async () => {
      await userEvent.type(textarea, ' hello world!');

      // user can type manually
      await expect(textarea.value).toBe(`${secondSuggestion} hello world!`);

      await userEvent.click(secondSuggestionButton);

      // clicking suggestion replaces existing textarea content
      await expect(textarea.value).toBe(secondSuggestion);
    });
  },
};

export const Messages: Story = {
  decorators: [],
  render: () => ({
    components: { Message },
    setup() {
      return { messages: MOCK_DUO_MESSAGES };
    },
    template: `
    <div class="min-h-0 flex-1 overflow-y-auto scroll-smooth [scrollbar-gutter:stable]">
      <div class="px-5">
        <Message v-for="(message, index) in messages" :key="index" :message="message" />
      </div>
    </div>`,
  }),
};
