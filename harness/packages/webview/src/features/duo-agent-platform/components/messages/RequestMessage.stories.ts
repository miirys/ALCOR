import type { Meta, StoryObj } from '@storybook/vue3-vite';
import { fn } from 'storybook/test';
import type { DuoMessage } from '@gitlab-org/graphql';
import { MOCK_TOOL_APPROVAL_MESSAGE } from '../../mockData';
import RequestMessage from './RequestMessage.vue';
import piniaDecorator from '@/stories/piniaDecorator';

const MOCK_CREATE_ISSUE_REQUEST: DuoMessage = {
  content: 'I need to create an issue to track this work. Do you approve?',
  messageType: 'request',
  toolInfo: JSON.stringify({
    name: 'create_issue',
    args: {
      project_path: 'gitlab-org/gitlab',
      title: 'Fix performance regression in pipeline view',
      description: 'The pipeline view is slow when there are more than 100 jobs.',
    },
  }),
};

const MOCK_CREATE_MR_REQUEST: DuoMessage = {
  content: 'I need to create a merge request for these changes. Do you approve?',
  messageType: 'request',
  toolInfo: JSON.stringify({
    name: 'create_merge_request',
    args: {
      project_path: 'gitlab-org/gitlab',
      title: 'Fix pipeline performance',
      source_branch: 'fix/pipeline-perf',
      target_branch: 'main',
    },
  }),
};

const meta = {
  title: 'duo-agent-platform/Messages/RequestMessage',
  component: RequestMessage,
  decorators: [piniaDecorator],
  args: {
    onApproveOnce: fn(),
    onApproveForSession: fn(),
    onReject: fn(),
    onCopyCode: fn(),
  },
  parameters: {
    a11y: {
      test: 'todo',
    },
  },
} satisfies Meta<typeof RequestMessage>;

export default meta;
type Story = StoryObj<typeof meta>;

export const RunCommandPendingApproval: Story = {
  name: 'Run command',
  args: {
    message: MOCK_TOOL_APPROVAL_MESSAGE,
    awaitingApproval: true,
  },
};

export const CreateIssuePendingApproval: Story = {
  name: 'Create issue',
  args: {
    message: MOCK_CREATE_ISSUE_REQUEST,
    awaitingApproval: true,
  },
};

export const CreateMRPendingApproval: Story = {
  name: 'Create merge request',
  args: {
    message: MOCK_CREATE_MR_REQUEST,
    awaitingApproval: true,
  },
};

export const NoApprovalUI: Story = {
  name: 'No approval UI (not last message)',
  args: {
    message: MOCK_TOOL_APPROVAL_MESSAGE,
    awaitingApproval: false,
  },
};
