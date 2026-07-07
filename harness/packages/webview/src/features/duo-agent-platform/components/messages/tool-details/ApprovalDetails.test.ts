import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import ApprovalDetails from './ApprovalDetails.vue';

function mountDetails(toolInfo: Record<string, unknown>) {
  return mount(ApprovalDetails, { props: { toolInfo } });
}

describe('ApprovalDetails', () => {
  describe('when tool is a command tool', () => {
    it('renders CommandToolDetails for run_command', () => {
      const wrapper = mountDetails({
        tool: 'run_command',
        toolArgs: { command: 'ls' },
        toolResponse: null,
      });
      expect(wrapper.findComponent({ name: 'CommandToolDetails' }).exists()).toBe(true);
      expect(wrapper.findComponent({ name: 'ToolApprovalDetails' }).exists()).toBe(false);
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

  describe('when tool is not a command tool', () => {
    it('renders ToolApprovalDetails for create_issue', () => {
      const wrapper = mountDetails({
        tool: 'create_issue',
        toolArgs: { title: 'Bug' },
        toolResponse: null,
      });
      expect(wrapper.findComponent({ name: 'ToolApprovalDetails' }).exists()).toBe(true);
      expect(wrapper.findComponent({ name: 'CommandToolDetails' }).exists()).toBe(false);
    });

    it('renders ToolApprovalDetails for create_work_item', () => {
      const wrapper = mountDetails({
        tool: 'create_work_item',
        toolArgs: { title: 'Task', project_path: 'gitlab-org/gitlab' },
        toolResponse: null,
      });
      expect(wrapper.findComponent({ name: 'ToolApprovalDetails' }).exists()).toBe(true);
    });

    it('renders ToolApprovalDetails for read_file', () => {
      const wrapper = mountDetails({
        tool: 'read_file',
        toolArgs: { file_path: 'foo.ts' },
        toolResponse: null,
      });
      expect(wrapper.findComponent({ name: 'ToolApprovalDetails' }).exists()).toBe(true);
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
        toolArgs: {},
        toolResponse: null,
      });
      wrapper.findComponent({ name: 'ToolApprovalDetails' }).vm.$emit('copyCode', 'content');
      expect(wrapper.emitted('copyCode')).toEqual([['content']]);
    });
  });
});
