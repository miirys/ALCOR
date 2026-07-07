import type { Meta, StoryObj } from '@storybook/vue3-vite';

import { fn, spyOn } from 'storybook/test';
import type { AgentPlatformRepository } from '@gitlab-lsp/workflow-api';
import piniaDecorator from '@/stories/piniaDecorator';
import { DuoAgentPlatformMessageBus } from '../services/DuoAgentPlatformMessageBus';
import { useRepositoriesStore } from '../stores/repositoriesStore';
import { useChatStore } from '../stores/chatStore';
import ProjectSelector from './ProjectSelector.vue';

const MOCK_MESSAGE_BUS: DuoAgentPlatformMessageBus = {
  sendRequest: fn(),
  sendNotification: fn(),
  onNotification: fn(),
  onRequest: fn(),
};

const MOCK_REPOSITORIES: AgentPlatformRepository[] = [
  {
    type: 'single',
    rootFsPath: '/home/user/gitlab-lsp',
    folderName: 'gitlab-lsp',
    projects: [
      {
        id: 'gid://gitlab/Project/1',
        name: 'GitLab Language Server',
        namespaceWithPath: 'gitlab-org/gitlab-lsp',
        remoteName: 'origin',
        duoAgenticChatAvailable: true,
        namespaceId: 'gid://gitlab/Namespace/1',
        rootNamespaceId: 'gid://gitlab/Namespace/1',
      },
    ],
  },
];

const MOCK_MULTI_REPO_REPOSITORIES: AgentPlatformRepository[] = [
  {
    type: 'single',
    rootFsPath: '/home/user/gitlab-lsp',
    folderName: 'gitlab-lsp',
    projects: [
      {
        id: 'gid://gitlab/Project/1',
        name: 'GitLab Language Server',
        namespaceWithPath: 'gitlab-org/gitlab-lsp',
        remoteName: 'origin',
        duoAgenticChatAvailable: true,
        namespaceId: 'gid://gitlab/Namespace/1',
        rootNamespaceId: 'gid://gitlab/Namespace/1',
      },
      {
        id: 'gid://gitlab/Project/2',
        name: 'GitLab Language Server (fork)',
        namespaceWithPath: 'my-user/gitlab-lsp',
        remoteName: 'upstream',
        duoAgenticChatAvailable: false,
        namespaceId: 'gid://gitlab/Namespace/2',
        rootNamespaceId: 'gid://gitlab/Namespace/2',
      },
    ],
  },
  {
    type: 'multiple',
    rootFsPath: '/home/user/gitlab',
    folderName: 'gitlab',
    projects: [
      {
        id: 'gid://gitlab/Project/3',
        name: 'GitLab',
        namespaceWithPath: 'gitlab-org/gitlab',
        remoteName: 'origin',
        duoAgenticChatAvailable: true,
        namespaceId: 'gid://gitlab/Namespace/3',
        rootNamespaceId: 'gid://gitlab/Namespace/3',
      },
    ],
  },
];

const setupStore = (mockMessageBus?: DuoAgentPlatformMessageBus) => {
  const repositoriesStore = useRepositoriesStore();
  const chatStore = useChatStore();
  repositoriesStore.$reset();
  if (mockMessageBus) {
    repositoriesStore.initialize(mockMessageBus);
    chatStore.initialize(mockMessageBus);
    repositoriesStore.isLoading = false;
  }
};

const meta = {
  title: 'duo-agent-platform/ProjectSelector',
  component: ProjectSelector,
  decorators: [piniaDecorator],
  parameters: {
    a11y: {
      test: 'todo',
    },
  },
} satisfies Meta<typeof ProjectSelector>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => ({
    components: { ProjectSelector },
    setup() {
      setupStore(MOCK_MESSAGE_BUS);
      const repositoriesStore = useRepositoriesStore();
      repositoriesStore.repositories = MOCK_REPOSITORIES;
    },
    template: '<ProjectSelector />',
  }),
};

export const MultipleRepositories: Story = {
  render: () => ({
    components: { ProjectSelector },
    setup() {
      setupStore(MOCK_MESSAGE_BUS);
      const repositoriesStore = useRepositoriesStore();

      repositoriesStore.repositories = MOCK_MULTI_REPO_REPOSITORIES;
    },
    template: '<ProjectSelector />',
  }),
};

export const NoProjectsAvailable: Story = {
  render: () => ({
    components: { ProjectSelector },
    setup() {
      setupStore(MOCK_MESSAGE_BUS);
      const repositoriesStore = useRepositoriesStore();
      repositoriesStore.repositories = [];
    },
    template: '<ProjectSelector />',
  }),
};

export const Loading: Story = {
  render: () => ({
    components: { ProjectSelector },
    setup() {
      setupStore(MOCK_MESSAGE_BUS);
      const repositoriesStore = useRepositoriesStore();

      repositoriesStore.isLoading = true;
      // Never resolves to keep loading state
      spyOn(MOCK_MESSAGE_BUS, 'sendRequest').mockReturnValue(new Promise(() => {}));
    },
    template: '<ProjectSelector />',
  }),
};

export const LockedToWorkflow: Story = {
  render: () => ({
    components: { ProjectSelector },
    setup() {
      setupStore(MOCK_MESSAGE_BUS);
      const chatStore = useChatStore();

      chatStore.setWorkflowProject('gitlab-org/gitlab-lsp');
    },
    template: '<ProjectSelector />',
  }),
};
