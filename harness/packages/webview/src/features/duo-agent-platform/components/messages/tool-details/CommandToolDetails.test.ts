import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import CommandToolDetails from './CommandToolDetails.vue';

function mountCommand(
  props: ConstructorParameters<typeof CommandToolDetails>[0]['propsData'] = {},
) {
  return mount(CommandToolDetails, {
    props: { toolName: 'run_command', args: {}, toolResponse: null, ...props },
  });
}

describe('CommandToolDetails', () => {
  describe('command string rendering', () => {
    it('renders a run_command with command and args', () => {
      const wrapper = mountCommand({
        toolName: 'run_command',
        args: { command: 'npm', args: 'run build' },
        toolResponse: null,
      });
      expect(wrapper.find('code').text()).toBe('npm run build');
    });

    it('renders a run_command with only command when no args', () => {
      const wrapper = mountCommand({
        toolName: 'run_command',
        args: { command: 'npm install' },
        toolResponse: null,
      });
      expect(wrapper.find('code').text()).toBe('npm install');
    });

    it('renders a run_git_command prefixed with git', () => {
      const wrapper = mountCommand({
        toolName: 'run_git_command',
        args: { command: 'status', args: '--short' },
        toolResponse: null,
      });
      expect(wrapper.find('code').text()).toBe('git status --short');
    });

    it('renders a shell_command using program field', () => {
      const wrapper = mountCommand({
        toolName: 'shell_command',
        args: { program: 'ls', args: '-la' },
        toolResponse: null,
      });
      expect(wrapper.find('code').text()).toBe('ls -la');
    });
  });

  describe('command output', () => {
    it('does not render the expand trigger when toolResponse is null', () => {
      const wrapper = mountCommand({
        toolName: 'run_command',
        args: { command: 'ls' },
        toolResponse: null,
      });
      expect(wrapper.text()).not.toContain('Expand command output');
    });

    it('renders the expand trigger when toolResponse has content', () => {
      const wrapper = mountCommand({
        toolName: 'run_command',
        args: { command: 'ls' },
        toolResponse: { content: 'file1.ts\nfile2.ts' },
      });
      expect(wrapper.text()).toContain('Expand command output');
    });

    it('renders the expand trigger when toolResponse is a plain string', () => {
      const wrapper = mountCommand({
        toolName: 'run_command',
        args: { command: 'echo hi' },
        toolResponse: 'hi',
      });
      expect(wrapper.text()).toContain('Expand command output');
    });
  });

  describe('copyCode event', () => {
    it('bubbles copyCode from the CodeBlock after expanding output', async () => {
      const wrapper = mountCommand({
        toolName: 'run_command',
        args: { command: 'ls' },
        toolResponse: { content: 'file1.ts' },
      });
      await wrapper.find('button').trigger('click');
      wrapper.findComponent({ name: 'CodeBlock' }).vm.$emit('copyCode', 'file1.ts');
      expect(wrapper.emitted('copyCode')).toEqual([['file1.ts']]);
    });
  });
});
