import type { Meta, StoryObj } from '@storybook/vue3-vite';
import { fn } from 'storybook/test';
import type { DuoMessage } from '@gitlab-org/graphql';
import ToolMessage from './ToolMessage.vue';
import piniaDecorator from '@/stories/piniaDecorator';

const MOCK_TOOL_SUCCESS_MESSAGE: DuoMessage = {
  content: 'Read file src/components/ProductList.tsx',
  messageType: 'tool',
  toolInfo: JSON.stringify({
    name: 'read_file',
    args: { file_path: 'src/components/ProductList.tsx' },
    tool_response: { status: 'success', content: 'export function ProductList() { ... }' },
  }),
};

const MOCK_TOOL_FAILURE_MESSAGE: DuoMessage = {
  content: 'Failed to read file',
  messageType: 'tool',
  toolInfo: JSON.stringify({
    name: 'read_file',
    args: { file_path: 'src/missing.tsx' },
    tool_response: { status: 'failure', content: 'File not found' },
  }),
};

const MOCK_TOOL_TIMED_OUT_MESSAGE: DuoMessage = {
  content: 'Command timed out',
  messageType: 'tool',
  toolInfo: JSON.stringify({
    name: 'run_command',
    args: { command: 'npm test', args: '--watch' },
    tool_response: { status: 'timed_out' },
  }),
};

const MOCK_TOOL_CANCELLED_MESSAGE: DuoMessage = {
  content: 'Command was cancelled',
  messageType: 'tool',
  toolInfo: JSON.stringify({
    name: 'run_command',
    args: { command: 'npm run build' },
    tool_response: { status: 'cancelled' },
  }),
};

const MOCK_GIT_COMMAND_MESSAGE: DuoMessage = {
  content: 'Ran git status',
  messageType: 'tool',
  toolInfo: JSON.stringify({
    name: 'run_git_command',
    args: { command: 'status', args: '--short' },
    tool_response: {
      status: 'success',
      content: 'M  src/components/ProductList.tsx\n?? src/utils/helpers.ts',
    },
  }),
};

const meta = {
  title: 'duo-agent-platform/Messages/ToolMessage',
  component: ToolMessage,
  decorators: [piniaDecorator],
  args: {
    onCopyCode: fn(),
  },
  parameters: {
    a11y: {
      test: 'todo',
    },
  },
} satisfies Meta<typeof ToolMessage>;

export default meta;
type Story = StoryObj<typeof meta>;

export const ApprovedSuccess: Story = {
  name: 'Approved — success',
  args: {
    message: MOCK_TOOL_SUCCESS_MESSAGE,
    wasApproved: true,
  },
};

export const ApprovedFailure: Story = {
  name: 'Approved — failure',
  args: {
    message: MOCK_TOOL_FAILURE_MESSAGE,
    wasApproved: true,
  },
};

export const TimedOut: Story = {
  name: 'Timed out',
  args: {
    message: MOCK_TOOL_TIMED_OUT_MESSAGE,
    wasApproved: true,
  },
};

export const Cancelled: Story = {
  args: {
    message: MOCK_TOOL_CANCELLED_MESSAGE,
    wasApproved: true,
  },
};

export const GitCommand: Story = {
  name: 'Git command',
  args: {
    message: MOCK_GIT_COMMAND_MESSAGE,
    wasApproved: true,
  },
};
