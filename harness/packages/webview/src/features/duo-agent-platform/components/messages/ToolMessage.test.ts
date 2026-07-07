import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import type { DuoMessage } from '@gitlab-org/graphql';
import ToolMessage from './ToolMessage.vue';

const TOOL_SUCCESS_MESSAGE: DuoMessage = {
  content: 'Read file src/foo.ts',
  messageType: 'tool',
  toolInfo: JSON.stringify({
    name: 'read_file',
    args: { file_path: 'src/foo.ts' },
    tool_response: { status: 'success', content: 'export const foo = 1;' },
  }),
};

const TOOL_FAILURE_MESSAGE: DuoMessage = {
  content: 'Failed to read file',
  messageType: 'tool',
  toolInfo: JSON.stringify({
    name: 'read_file',
    args: { file_path: 'src/missing.ts' },
    tool_response: { status: 'failure', content: 'File not found' },
  }),
};

const TOOL_NO_TOOL_INFO_MESSAGE: DuoMessage = {
  content: 'Just a message',
  messageType: 'tool',
  toolInfo: null,
};

function mountToolMessage(props: Partial<InstanceType<typeof ToolMessage>['$props']> = {}) {
  setActivePinia(createPinia());
  return mount(ToolMessage, {
    props: {
      message: TOOL_SUCCESS_MESSAGE,
      ...props,
    },
    attachTo: document.body,
  });
}

describe('ToolMessage', () => {
  describe('when toolInfo is null', () => {
    it('does not render the tool card', () => {
      const wrapper = mountToolMessage({ message: TOOL_NO_TOOL_INFO_MESSAGE });
      expect(wrapper.find('.border').exists()).toBe(false);
    });
  });

  describe('when toolInfo is present', () => {
    it('renders the tool label with underscores replaced by spaces', () => {
      const wrapper = mountToolMessage();
      expect(wrapper.text()).toContain('read file');
    });

    it('renders the toggle button collapsed by default', () => {
      const wrapper = mountToolMessage();
      const button = wrapper.find('button[aria-label="Tool details"]');
      expect(button.exists()).toBe(true);
      expect(button.attributes('aria-expanded')).toBe('false');
    });

    it('expands the tool details when the toggle button is clicked', async () => {
      const wrapper = mountToolMessage();
      const button = wrapper.find('button[aria-label="Tool details"]');
      await button.trigger('click');
      expect(button.attributes('aria-expanded')).toBe('true');
      expect(wrapper.findComponent({ name: 'ExecutionDetails' }).exists()).toBe(true);
    });
  });

  describe('status badge', () => {
    it('shows Approved badge when wasApproved is true and status is success', () => {
      const wrapper = mountToolMessage({ message: TOOL_SUCCESS_MESSAGE, wasApproved: true });
      expect(wrapper.text()).toContain('Approved');
    });

    it('shows Failed badge when wasApproved is true and status is failure', () => {
      const wrapper = mountToolMessage({ message: TOOL_FAILURE_MESSAGE, wasApproved: true });
      expect(wrapper.text()).toContain('Failed');
    });

    it('shows Timed out badge when wasApproved is true and status is timed_out', () => {
      const TOOL_TIMED_OUT_MESSAGE: DuoMessage = {
        content: 'Command timed out',
        messageType: 'tool',
        toolInfo: JSON.stringify({
          name: 'run_command',
          args: { command: 'npm test' },
          tool_response: { status: 'timed_out' },
        }),
      };
      const wrapper = mountToolMessage({ message: TOOL_TIMED_OUT_MESSAGE, wasApproved: true });
      expect(wrapper.text()).toContain('Timed out');
    });

    it('shows Cancelled badge when wasApproved is true and status is cancelled', () => {
      const TOOL_CANCELLED_MESSAGE: DuoMessage = {
        content: 'Command was cancelled',
        messageType: 'tool',
        toolInfo: JSON.stringify({
          name: 'run_command',
          args: { command: 'npm run build' },
          tool_response: { status: 'cancelled' },
        }),
      };
      const wrapper = mountToolMessage({ message: TOOL_CANCELLED_MESSAGE, wasApproved: true });
      expect(wrapper.text()).toContain('Cancelled');
    });

    it('shows Failed badge when wasApproved is true and toolResponse has no recognised status', () => {
      const TOOL_NO_STATUS_MESSAGE: DuoMessage = {
        content: 'Tool ran',
        messageType: 'tool',
        toolInfo: JSON.stringify({
          name: 'read_file',
          args: { file_path: 'foo.ts' },
          tool_response: { content: 'some output' },
        }),
      };
      const wrapper = mountToolMessage({ message: TOOL_NO_STATUS_MESSAGE, wasApproved: true });
      expect(wrapper.text()).toContain('Failed');
    });

    it('does not show a badge when wasApproved is false', () => {
      const wrapper = mountToolMessage({ message: TOOL_SUCCESS_MESSAGE, wasApproved: false });
      expect(wrapper.text()).not.toContain('Approved');
      expect(wrapper.text()).not.toContain('Failed');
    });
  });

  describe('copyCode event', () => {
    it('bubbles copyCode from ExecutionDetails', async () => {
      const wrapper = mountToolMessage();
      await wrapper.find('button[aria-label="Tool details"]').trigger('click');
      wrapper.findComponent({ name: 'ExecutionDetails' }).vm.$emit('copyCode', 'some code');
      expect(wrapper.emitted('copyCode')).toEqual([['some code']]);
    });
  });
});
