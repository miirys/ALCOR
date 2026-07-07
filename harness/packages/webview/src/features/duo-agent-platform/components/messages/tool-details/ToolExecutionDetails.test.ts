import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import ToolExecutionDetails from './ToolExecutionDetails.vue';

function mountCompleted(props: {
  toolName?: string;
  args?: Record<string, unknown>;
  toolResponse?: unknown;
}) {
  return mount(ToolExecutionDetails, {
    props: {
      toolName: 'read_file',
      args: {},
      toolResponse: null,
      ...props,
    },
  });
}

describe('ToolExecutionDetails', () => {
  describe('request section', () => {
    it('renders a Request figure with the tool name', () => {
      const wrapper = mountCompleted({ toolName: 'create_issue' });
      expect(wrapper.text()).toContain('Request');
      expect(wrapper.text()).toContain('create_issue');
    });

    it('always renders the Request figure', () => {
      const wrapper = mountCompleted({ args: {} });
      expect(wrapper.find('figure').exists()).toBe(true);
    });
  });

  describe('response section', () => {
    it('does not render a Response figure when toolResponse is null', () => {
      const wrapper = mountCompleted({ toolResponse: null });
      expect(wrapper.text()).not.toContain('Response');
    });

    it('renders a Response figure when toolResponse is a plain string', () => {
      const wrapper = mountCompleted({ toolResponse: 'plain string output' });
      expect(wrapper.text()).toContain('Response');
    });

    it('pretty-prints a toolResponse that is a JSON string', () => {
      const tree = [{ id: '1', name: '.gitlab', type: 'tree' }];
      const wrapper = mountCompleted({ toolResponse: JSON.stringify({ tree }) });
      const code = wrapper.findAllComponents({ name: 'CodeBlock' })[1];
      expect(code?.props('code')).toBe(JSON.stringify({ tree }, null, 2));
    });

    it('renders a Response figure when toolResponse has a content field with a plain string', () => {
      const wrapper = mountCompleted({ toolResponse: { content: 'Issue created' } });
      expect(wrapper.text()).toContain('Response');
    });

    it('pretty-prints a toolResponse whose content field is a JSON string', () => {
      const tree = [{ id: '1', name: 'src', type: 'tree' }];
      const wrapper = mountCompleted({
        toolResponse: { content: JSON.stringify({ tree }) },
      });
      const code = wrapper.findAllComponents({ name: 'CodeBlock' })[1];
      expect(code?.props('code')).toBe(JSON.stringify({ tree }, null, 2));
    });

    it('renders a Response figure when toolResponse is an object without a content field', () => {
      const wrapper = mountCompleted({ toolResponse: { status: 'success', count: 3 } });
      expect(wrapper.text()).toContain('Response');
    });

    it('pretty-prints a toolResponse object without a content field', () => {
      const wrapper = mountCompleted({ toolResponse: { status: 'success', count: 3 } });
      const code = wrapper.findAllComponents({ name: 'CodeBlock' })[1];
      expect(code?.props('code')).toBe(JSON.stringify({ status: 'success', count: 3 }, null, 2));
    });
  });

  describe('copyCode event', () => {
    it('bubbles copyCode from the request CodeBlock', () => {
      const wrapper = mountCompleted({ args: { file: 'foo.ts' } });
      wrapper.findAllComponents({ name: 'CodeBlock' })[0]?.vm.$emit('copyCode', 'some code');
      expect(wrapper.emitted('copyCode')).toEqual([['some code']]);
    });

    it('bubbles copyCode from the response CodeBlock', () => {
      const wrapper = mountCompleted({ toolResponse: { content: 'some output' } });
      wrapper.findAllComponents({ name: 'CodeBlock' })[1]?.vm.$emit('copyCode', 'output');
      expect(wrapper.emitted('copyCode')).toEqual([['output']]);
    });
  });
});
