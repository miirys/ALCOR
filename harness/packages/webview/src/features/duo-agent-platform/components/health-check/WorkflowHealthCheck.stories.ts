import type { Meta, StoryObj } from '@storybook/vue3-vite';
import { onMounted } from 'vue';
import { expect, spyOn } from 'storybook/test';
import type { AgentPlatformRepository, HealthCheckData } from '@gitlab-lsp/workflow-api';
import { getDuoAgentPlatformMessageBus } from '../../services/DuoAgentPlatformMessageBus';
import { useRepositoriesStore } from '../../stores/repositoriesStore';
import WorkflowHealthCheck from './WorkflowHealthCheck.vue';
import piniaDecorator from '@/stories/piniaDecorator';

const PROJECT_PATH = 'gitlab-org/gitlab';

const repositories = (duoFeaturesEnabled: boolean): AgentPlatformRepository[] =>
  [
    {
      rootFsPath: '/workspace',
      projects: [
        { namespaceWithPath: PROJECT_PATH, duoFeaturesEnabled, duoAgenticChatAvailable: true },
      ],
    },
  ] as unknown as AgentPlatformRepository[];

const capturedHandlers: Record<string, (payload: unknown) => void> = {};

// The health store reads the bus singleton directly and derives currentState from private
// refs, so each state is driven through its real inputs: stub the checkHealth response,
// capture notification handlers (to toggle authentication), and seed a settled repositories
// store. Selecting the project up front lets the store's immediate watcher run the check on
// mount; leaving it unselected resolves to the "no project" path without a request.
const driveHealthCheck = ({
  duoFeaturesEnabled = true,
  selectProject = false,
  healthData,
}: {
  duoFeaturesEnabled?: boolean;
  selectProject?: boolean;
  healthData?: HealthCheckData;
} = {}) => {
  const bus = getDuoAgentPlatformMessageBus();
  spyOn(bus, 'onNotification').mockImplementation((name, handler) => {
    capturedHandlers[name] = handler as (payload: unknown) => void;
    return { dispose: () => {} };
  });
  spyOn(bus, 'sendRequest').mockImplementation((type) =>
    type === 'checkHealth' && healthData ? Promise.resolve(healthData) : new Promise(() => {}),
  );

  const store = useRepositoriesStore();
  store.repositories = repositories(duoFeaturesEnabled);
  store.isLoading = false;
  store.selectedProjectPath = selectProject ? PROJECT_PATH : null;
};

const meta = {
  title: 'duo-agent-platform/health-check/WorkflowHealthCheck',
  component: WorkflowHealthCheck,
  decorators: [piniaDecorator],
  parameters: {
    a11y: {
      test: 'todo',
    },
  },
} satisfies Meta<typeof WorkflowHealthCheck>;

export default meta;
type Story = StoryObj<typeof meta>;

export const AuthenticationError: Story = {
  render: () => ({
    components: { WorkflowHealthCheck },
    setup() {
      driveHealthCheck();
      onMounted(() => capturedHandlers.setAuthenticationStatus?.(false));
    },
    template: '<WorkflowHealthCheck />',
  }),
  play: async ({ canvas }) => {
    await expect(await canvas.findByText('Authentication required')).toBeVisible();
  },
};

export const AgenticFeaturesDisabled: Story = {
  render: () => ({
    components: { WorkflowHealthCheck },
    setup() {
      driveHealthCheck({ duoFeaturesEnabled: false });
    },
    template: '<WorkflowHealthCheck />',
  }),
  play: async ({ canvas }) => {
    await expect(await canvas.findByText('GitLab Duo Agentic features are disabled')).toBeVisible();
  },
};

export const InvalidProject: Story = {
  render: () => ({
    components: { WorkflowHealthCheck },
    setup() {
      driveHealthCheck();
    },
    template: '<WorkflowHealthCheck />',
  }),
  play: async ({ canvas }) => {
    await expect(await canvas.findByText('Use with a GitLab project')).toBeVisible();
  },
};

export const ProjectPermissions: Story = {
  render: () => ({
    components: { WorkflowHealthCheck },
    setup() {
      driveHealthCheck({
        selectProject: true,
        healthData: {
          enabled: false,
          checks: [
            { name: 'developer_access', value: true, message: 'You have the Developer role.' },
            { name: 'duo_features_enabled', value: false, message: '' },
            { name: 'feature_flag', value: true, message: '' },
            { name: 'feature_available', value: false, message: '' },
          ],
        },
      });
    },
    template: `<WorkflowHealthCheck project-path="${PROJECT_PATH}" />`,
  }),
  play: async ({ canvas }) => {
    await expect(await canvas.findByText('Turn on for this project')).toBeVisible();
    // The failing project-level checks render as actionable HealthCheckItem links.
    await expect(canvas.getByText('Turn on GitLab Duo for this project.')).toBeVisible();
  },
};

export const UserPermissions: Story = {
  render: () => ({
    components: { WorkflowHealthCheck },
    setup() {
      driveHealthCheck({
        selectProject: true,
        healthData: {
          enabled: false,
          checks: [{ name: 'developer_access', value: false, message: '' }],
        },
      });
    },
    template: `<WorkflowHealthCheck project-path="${PROJECT_PATH}" />`,
  }),
  play: async ({ canvas }) => {
    await expect(await canvas.findByText('Unavailable to you')).toBeVisible();
    await expect(canvas.getByText(PROJECT_PATH)).toBeVisible();
  },
};

export const UnknownError: Story = {
  render: () => ({
    components: { WorkflowHealthCheck },
    setup() {
      driveHealthCheck({ selectProject: true, healthData: { enabled: false, checks: [] } });
    },
    template: '<WorkflowHealthCheck />',
  }),
  play: async ({ canvas }) => {
    await expect(await canvas.findByText('GitLab Duo Agent Platform is disabled')).toBeVisible();
  },
};
