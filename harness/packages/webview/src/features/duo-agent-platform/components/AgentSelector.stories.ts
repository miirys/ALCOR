import type { Meta, StoryObj } from '@storybook/vue3-vite';

import { fn } from 'storybook/test';
import type { Agent } from '@gitlab-org/lib-duo-agent-platform/webview';
import piniaDecorator from '@/stories/piniaDecorator';
import { DuoAgentPlatformMessageBus } from '../services/DuoAgentPlatformMessageBus';
import { useAgentsStore } from '../stores/agentsStore';
import AgentSelector from './AgentSelector.vue';

const MOCK_MESSAGE_BUS: DuoAgentPlatformMessageBus = {
  sendRequest: fn(),
  sendNotification: fn(),
  onNotification: fn(),
  onRequest: fn(),
};

const DEFAULT_AGENT: Agent = {
  id: 'gid://gitlab/Ai::Catalog::FoundationalChatAgent/1',
  name: 'GitLab Duo',
  description: 'Duo is your general development assistant',
  foundational: true,
  referenceWithVersion: 'chat',
};

const CUSTOM_AGENTS: Agent[] = [
  DEFAULT_AGENT,
  {
    id: 'gid://gitlab/Ai::Catalog::Agent/2',
    name: 'Code Reviewer',
    description:
      'Reviews merge requests and suggests improvements. Reviews merge requests and suggests improvements. Reviews merge requests and suggests improvements',
    foundational: true,
    referenceWithVersion: 'review',
  },
  {
    id: 'gid://gitlab/Ai::Catalog::Agent/3',
    name: 'Security Scanner',
    description: 'Scans code for vulnerabilities and security issues',
    foundational: false,
    pinnedItemVersionId: 'gid://gitlab/Ai::Catalog::AgentVersion/20',
  },
];

const MANY_AGENTS: Agent[] = [
  DEFAULT_AGENT,
  ...Array.from({ length: 8 }, (_, i) => ({
    id: `gid://gitlab/Ai::Catalog::Agent/${i + 10}`,
    name: `Custom Agent ${i + 1}`,
    description: `This is a custom agent that does task number ${i + 1}`,
    foundational: false,
    pinnedItemVersionId: `gid://gitlab/Ai::Catalog::AgentVersion/${i + 100}`,
  })),
];

const setupStore = (agents: Agent[], selectedId?: string) => {
  const store = useAgentsStore();
  store.$reset();
  store.initialize(MOCK_MESSAGE_BUS);
  store.agents = agents;
  store.selectedAgentId = selectedId ?? agents[0]?.id ?? DEFAULT_AGENT.id;
};

const meta = {
  title: 'duo-agent-platform/AgentSelector',
  component: AgentSelector,
  decorators: [piniaDecorator],
  parameters: {
    a11y: {
      test: 'todo',
    },
  },
} satisfies Meta<typeof AgentSelector>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => ({
    components: { AgentSelector },
    setup() {
      setupStore(CUSTOM_AGENTS);
    },
    template: '<AgentSelector @select="() => {}" />',
  }),
};

export const CustomAgentSelected: Story = {
  render: () => ({
    components: { AgentSelector },
    setup() {
      setupStore(CUSTOM_AGENTS, CUSTOM_AGENTS[1]?.id);
    },
    template: '<AgentSelector @select="() => {}" />',
  }),
};

export const ManyAgents: Story = {
  render: () => ({
    components: { AgentSelector },
    setup() {
      setupStore(MANY_AGENTS);
    },
    template: '<AgentSelector @select="() => {}" />',
  }),
};

export const SingleAgent: Story = {
  render: () => ({
    components: { AgentSelector },
    setup() {
      setupStore([DEFAULT_AGENT]);
    },
    template: '<AgentSelector @select="() => {}" />',
  }),
};

export const Error: Story = {
  render: () => ({
    components: { AgentSelector },
    setup() {
      setupStore([DEFAULT_AGENT]);
      const store = useAgentsStore();
      store.error = 'Failed to get more agents: Unknown error';
    },
    template: '<AgentSelector @select="() => {}" />',
  }),
};
