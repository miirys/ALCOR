import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import ExecutionDetails from './ExecutionDetails.vue';

function mountDetails(toolInfo: Record<string, unknown>) {
  return mount(ExecutionDetails, { props: { toolInfo } });
}

describe('ExecutionDetails', () => {
  describe('when tool is a command tool', () => {
    it('renders CommandToolDetails for run_command', () => {
      const wrapper = mountDetails({
        tool: 'run_command',
        toolArgs: { command: 'ls' },
        toolResponse: null,
      });
      expect(wrapper.findComponent({ name: 'CommandToolDetails' }).exists()).toBe(true);
      expect(wrapper.findComponent({ name: 'ToolApprovalDetails' }).exists()).toBe(false);
      expect(wrapper.findComponent({ name: 'ToolExecutionDetails' }).exists()).toBe(false);
    });

    it('renders CommandToolDetails for shell_command', () => {
      const wrapper = mountDetails({
        tool: 'shell_command',
        toolArgs: { command: 'pwd' },
        toolResponse: null,
      });
      expect(wrapper.findComponent({ name: 'CommandToolDetails' }).exists()).toBe(true);
    });

    it('renders CommandToolDetails for run_git_command', () => {
      const wrapper = mountDetails({
        tool: 'run_git_command',
        toolArgs: { command: 'status' },
        toolResponse: null,
      });
      expect(wrapper.findComponent({ name: 'CommandToolDetails' }).exists()).toBe(true);
    });
  });

  describe('when tool is an approval tool', () => {
    it('renders ToolApprovalDetails for create_issue', () => {
      const wrapper = mountDetails({
        tool: 'create_issue',
        toolArgs: { title: 'Bug', project_path: 'gitlab-org/gitlab' },
        toolResponse: null,
      });
      expect(wrapper.findComponent({ name: 'ToolApprovalDetails' }).exists()).toBe(true);
      expect(wrapper.findComponent({ name: 'CommandToolDetails' }).exists()).toBe(false);
      expect(wrapper.findComponent({ name: 'ToolExecutionDetails' }).exists()).toBe(false);
    });

    it('renders ToolApprovalDetails for create_work_item', () => {
      const wrapper = mountDetails({
        tool: 'create_work_item',
        toolArgs: { title: 'Task', project_path: 'gitlab-org/gitlab' },
        toolResponse: null,
      });
      expect(wrapper.findComponent({ name: 'ToolApprovalDetails' }).exists()).toBe(true);
    });

    it('renders ToolApprovalDetails for create_commit', () => {
      const wrapper = mountDetails({
        tool: 'create_commit',
        toolArgs: { branch: 'main' },
        toolResponse: null,
      });
      expect(wrapper.findComponent({ name: 'ToolApprovalDetails' }).exists()).toBe(true);
    });

    it('renders ToolApprovalDetails for create_merge_request', () => {
      const wrapper = mountDetails({
        tool: 'create_merge_request',
        toolArgs: { title: 'Fix bug', source_branch: 'fix/bug', target_branch: 'main' },
        toolResponse: null,
      });
      expect(wrapper.findComponent({ name: 'ToolApprovalDetails' }).exists()).toBe(true);
    });
  });

  describe('when tool is a regular (non-approval, non-command) tool', () => {
    it('renders ToolExecutionDetails for read_file', () => {
      const wrapper = mountDetails({
        tool: 'read_file',
        toolArgs: { file_path: 'foo.ts' },
        toolResponse: null,
      });
      expect(wrapper.findComponent({ name: 'ToolExecutionDetails' }).exists()).toBe(true);
      expect(wrapper.findComponent({ name: 'CommandToolDetails' }).exists()).toBe(false);
      expect(wrapper.findComponent({ name: 'ToolApprovalDetails' }).exists()).toBe(false);
    });

    it('renders ToolExecutionDetails for search_code', () => {
      const wrapper = mountDetails({
        tool: 'search_code',
        toolArgs: { query: 'useMemo' },
        toolResponse: null,
      });
      expect(wrapper.findComponent({ name: 'ToolExecutionDetails' }).exists()).toBe(true);
    });
  });

  describe('copyCode event', () => {
    it('bubbles copyCode from CommandToolDetails', () => {
      const wrapper = mountDetails({
        tool: 'run_command',
        toolArgs: { command: 'ls' },
        toolResponse: null,
      });
      wrapper.findComponent({ name: 'CommandToolDetails' }).vm.$emit('copyCode', 'output');
      expect(wrapper.emitted('copyCode')).toEqual([['output']]);
    });

    it('bubbles copyCode from ToolApprovalDetails', () => {
      const wrapper = mountDetails({
        tool: 'create_issue',
        toolArgs: { title: 'Bug' },
        toolResponse: null,
      });
      wrapper.findComponent({ name: 'ToolApprovalDetails' }).vm.$emit('copyCode', 'params');
      expect(wrapper.emitted('copyCode')).toEqual([['params']]);
    });

    it('bubbles copyCode from ToolExecutionDetails', () => {
      const wrapper = mountDetails({
        tool: 'read_file',
        toolArgs: {},
        toolResponse: null,
      });
      wrapper.findComponent({ name: 'ToolExecutionDetails' }).vm.$emit('copyCode', 'content');
      expect(wrapper.emitted('copyCode')).toEqual([['content']]);
    });
  });
});
