import type { Meta, StoryObj } from '@storybook/vue3-vite';
import { fn } from 'storybook/test';
import ExecutionDetails from './ExecutionDetails.vue';

const meta = {
  title: 'duo-agent-platform/ExecutionDetails',
  component: ExecutionDetails,
  args: {
    onCopyCode: fn(),
  },
  parameters: {
    a11y: {
      test: 'todo',
    },
  },
} satisfies Meta<typeof ExecutionDetails>;

export default meta;
type Story = StoryObj<typeof meta>;

export const ReadFile: Story = {
  name: 'Read file',
  args: {
    toolInfo: {
      tool: 'read_file',
      toolArgs: { file_path: 'src/components/ProductList.tsx' },
      toolResponse: { status: 'success', content: 'export function ProductList() { ... }' },
    },
  },
};

export const NoResponse: Story = {
  name: 'No tool response',
  args: {
    toolInfo: {
      tool: 'read_file',
      toolArgs: { file_path: 'src/utils/helpers.ts' },
      toolResponse: null,
    },
  },
};

export const ShellCommand: Story = {
  name: 'Shell command',
  args: {
    toolInfo: {
      tool: 'run_command',
      toolArgs: { command: 'npm run build' },
      toolResponse: { status: 'success', content: 'Build complete in 4.2s' },
    },
  },
};

export const GitCommand: Story = {
  name: 'Git command',
  args: {
    toolInfo: {
      tool: 'run_git_command',
      toolArgs: { command: 'status', args: '--short' },
      toolResponse: {
        status: 'success',
        content: 'M  src/components/ProductList.tsx\n?? src/utils/helpers.ts',
      },
    },
  },
};

export const CreateIssue: Story = {
  name: 'Create issue (requires approval)',
  args: {
    toolInfo: {
      tool: 'create_issue',
      toolArgs: {
        project_path: 'gitlab-org/gitlab',
        title: 'Fix performance regression in pipeline view',
        description: 'The pipeline view is slow when there are more than 100 jobs.',
      },
      toolResponse: { status: 'success', content: 'Issue #1234 created.' },
    },
  },
};

export const CreateWorkItem: Story = {
  name: 'Create work item (requires approval)',
  args: {
    toolInfo: {
      tool: 'create_work_item',
      toolArgs: {
        project_path: 'gitlab-org/gitlab',
        title: 'Investigate memory leak',
        type_name: 'Task',
      },
      toolResponse: { status: 'success', content: 'Work item #42 created.' },
    },
  },
};
