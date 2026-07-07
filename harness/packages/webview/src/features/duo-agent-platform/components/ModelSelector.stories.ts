import type { Meta, StoryObj } from '@storybook/vue3-vite';

import { fn, spyOn } from 'storybook/test';
import piniaDecorator from '@/stories/piniaDecorator';
import { DuoAgentPlatformMessageBus } from '../services/DuoAgentPlatformMessageBus';
import { useModelsStore } from '../stores/modelsStore';
import ModelSelector from './ModelSelector.vue';

const MOCK_MESSAGE_BUS: DuoAgentPlatformMessageBus = {
  sendRequest: fn(),
  sendNotification: fn(),
  onNotification: fn(),
  onRequest: fn(),
};

const ANTHROPIC_MODELS = [
  {
    name: 'Anthropic / Claude 3.5 Sonnet',
    provider: 'Anthropic',
    ref: 'claude-sonnet-4',
    isDefault: true,
    isPinned: false,
    isSelected: false,
  },
  {
    name: 'Anthropic / Claude 3 Haiku',
    provider: 'Anthropic',
    ref: 'claude-haiku-4',
    isDefault: false,
    isPinned: false,
    isSelected: false,
  },
];

const MULTI_PROVIDER_MODELS = [
  ...ANTHROPIC_MODELS,
  {
    name: 'OpenAI / GPT-4o',
    provider: 'OpenAI',
    ref: 'gpt-4o',
    isDefault: false,
    isPinned: false,
    isSelected: false,
  },
  {
    name: 'Vertex / Gemini 3.1 Pro',
    provider: 'Vertex',
    ref: 'gemini-1.5-pro',
    isDefault: false,
    isPinned: false,
    isSelected: false,
  },
];

const setupStore = (
  models: typeof ANTHROPIC_MODELS,
  selectedRef: string | null = null,
  messageBus?: DuoAgentPlatformMessageBus,
) => {
  const store = useModelsStore();
  store.$reset();
  spyOn(MOCK_MESSAGE_BUS, 'sendRequest').mockImplementationOnce(fn().mockResolvedValueOnce(null));
  store.initialize(messageBus);
  store.userModelSwitchingEnabled = true;
  store.availableModels = models;
  store.selectedModelRef = selectedRef ?? models[0]?.ref ?? null;
};

const meta = {
  title: 'duo-agent-platform/ModelSelector',
  component: ModelSelector,
  decorators: [piniaDecorator],
  parameters: {
    a11y: {
      test: 'todo',
    },
  },
} satisfies Meta<typeof ModelSelector>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => ({
    components: { ModelSelector },
    setup() {
      setupStore(ANTHROPIC_MODELS, 'claude-sonnet-4', MOCK_MESSAGE_BUS);
    },
    template: '<ModelSelector />',
  }),
};

export const MultipleProviders: Story = {
  render: () => ({
    components: { ModelSelector },
    setup() {
      setupStore(MULTI_PROVIDER_MODELS, 'gpt-4o', MOCK_MESSAGE_BUS);
    },
    template: '<ModelSelector />',
  }),
};
export const WithPinnedModel: Story = {
  render: () => ({
    components: { ModelSelector },
    setup() {
      const store = useModelsStore();
      store.$reset();

      spyOn(MOCK_MESSAGE_BUS, 'sendRequest')
        .mockResolvedValueOnce(null) // getPersistedSelectedModel
        .mockResolvedValueOnce({
          userModelSwitchingEnabled: true,
          metadata: null,
          aiChatAvailableModels: {
            defaultModel: { name: 'Claude 3.5 Sonnet - Anthropic', ref: 'claude-sonnet-4' },
            pinnedModel: { name: 'Claude 3 Haiku - Anthropic', ref: 'claude-haiku-4' },
            selectableModels: [
              { name: 'Claude 3.5 Sonnet - Anthropic', ref: 'claude-sonnet-4' },
              { name: 'Claude 3 Haiku - Anthropic', ref: 'claude-haiku-4' },
            ],
          },
        });

      store.initialize(MOCK_MESSAGE_BUS);
      store.fetchAvailableModels('test').catch(() => undefined);
    },
    template: '<ModelSelector />',
  }),
};

export const Error: Story = {
  render: () => ({
    components: { ModelSelector },
    setup() {
      setupStore([], null, MOCK_MESSAGE_BUS);
      const store = useModelsStore();
      store.error = 'Failed to get available models: Unknown error';
    },
    template: '<ModelSelector />',
  }),
};
