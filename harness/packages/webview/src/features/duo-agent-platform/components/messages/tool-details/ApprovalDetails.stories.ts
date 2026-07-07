import type { Meta, StoryObj } from '@storybook/vue3-vite';
import { fn } from 'storybook/test';
import ApprovalDetails from './ApprovalDetails.vue';

const meta = {
  title: 'duo-agent-platform/ApprovalDetails',
  component: ApprovalDetails,
  args: {
    onCopyCode: fn(),
  },
  parameters: {
    a11y: {
      test: 'todo',
    },
  },
} satisfies Meta<typeof ApprovalDetails>;

export default meta;
type Story = StoryObj<typeof meta>;

export const CreateIssue: Story = {
  name: 'Create issue',
  args: {
    toolInfo: {
      tool: 'create_issue',
      toolArgs: {
        project_path: 'gitlab-org/gitlab',
        title: 'Fix performance regression in pipeline view',
        description: 'The pipeline view is slow when there are more than 100 jobs.',
      },
      toolResponse: null,
    },
  },
};

export const CreateMergeRequest: Story = {
  name: 'Create merge request',
  args: {
    toolInfo: {
      tool: 'create_merge_request',
      toolArgs: {
        project_path: 'gitlab-org/gitlab',
        title: 'Fix pipeline performance',
        source_branch: 'fix/pipeline-perf',
        target_branch: 'main',
      },
      toolResponse: null,
    },
  },
};

export const ShellCommand: Story = {
  name: 'Shell command',
  args: {
    toolInfo: {
      tool: 'run_command',
      toolArgs: { command: 'echo hello world && ls -la' },
      toolResponse: null,
    },
  },
};

export const GitCommand: Story = {
  name: 'Git command',
  args: {
    toolInfo: {
      tool: 'run_git_command',
      toolArgs: { command: 'push', args: '--force origin main' },
      toolResponse: null,
    },
  },
};

export const NoMetadata: Story = {
  name: 'No metadata badges',
  args: {
    toolInfo: {
      tool: 'search_code',
      toolArgs: { query: 'useMemo', file_pattern: '*.tsx' },
      toolResponse: null,
    },
  },
};
