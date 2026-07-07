import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import type { DuoMessage } from '@gitlab-org/graphql';
import RequestMessage from './RequestMessage.vue';

const MOCK_REQUEST_MESSAGE: DuoMessage = {
  content: 'I need to run a command. Do you approve?',
  messageType: 'request',
  toolInfo: JSON.stringify({
    name: 'run_command',
    args: { command: 'echo hello' },
  }),
};

const MOCK_REQUEST_NO_TOOL_INFO: DuoMessage = {
  content: 'A request without tool info',
  messageType: 'request',
  toolInfo: null,
};

function mountRequestMessage(props: Partial<InstanceType<typeof RequestMessage>['$props']> = {}) {
  setActivePinia(createPinia());
  return mount(RequestMessage, {
    props: {
      message: MOCK_REQUEST_MESSAGE,
      awaitingApproval: true,
      ...props,
    },
  });
}

describe('RequestMessage', () => {
  describe('when awaitingApproval is false', () => {
    it('renders the message content', () => {
      const wrapper = mountRequestMessage({ awaitingApproval: false });
      expect(wrapper.text()).toContain('I need to run a command. Do you approve?');
    });

    it('does not render the approval card', () => {
      const wrapper = mountRequestMessage({ awaitingApproval: false });
      expect(wrapper.find('.border').exists()).toBe(false);
    });
  });

  describe('when awaitingApproval is true and toolInfo is null', () => {
    it('does not render the approval card', () => {
      const wrapper = mountRequestMessage({ message: MOCK_REQUEST_NO_TOOL_INFO });
      expect(wrapper.find('.border').exists()).toBe(false);
    });
  });

  describe('when awaitingApproval is true and toolInfo is present', () => {
    it('renders the message content', () => {
      const wrapper = mountRequestMessage();
      expect(wrapper.text()).toContain('I need to run a command. Do you approve?');
    });

    it('renders the tool label with underscores replaced by spaces', () => {
      const wrapper = mountRequestMessage();
      expect(wrapper.text()).toContain('run command');
    });

    it('renders the Pending badge', () => {
      const wrapper = mountRequestMessage();
      expect(wrapper.text()).toContain('Pending');
    });

    it('renders the Approve and Deny buttons', () => {
      const wrapper = mountRequestMessage();
      expect(wrapper.text()).toContain('Approve');
      expect(wrapper.text()).toContain('Deny');
    });
  });

  describe('when Approve is clicked', () => {
    it('emits approveOnce', async () => {
      const wrapper = mountRequestMessage();
      await wrapper.find('button[class*="rounded-r-none"]').trigger('click');
      expect(wrapper.emitted('approveOnce')).toHaveLength(1);
    });

    it('disables all buttons after clicking', async () => {
      const wrapper = mountRequestMessage();
      await wrapper.find('button[class*="rounded-r-none"]').trigger('click');
      const buttons = wrapper.findAll('button');
      buttons.forEach((btn) => {
        expect(btn.attributes('disabled')).toBeDefined();
      });
    });
  });

  describe('when Deny is clicked', () => {
    it('shows the reject textarea', async () => {
      const wrapper = mountRequestMessage();
      const denyButton = wrapper.findAll('button').find((b) => b.text() === 'Deny');
      await denyButton!.trigger('click');
      expect(wrapper.find('textarea').exists()).toBe(true);
    });

    it('shows the rejection reason textarea with an optional placeholder', async () => {
      const wrapper = mountRequestMessage();
      const denyButton = wrapper.findAll('button').find((b) => b.text() === 'Deny');
      await denyButton!.trigger('click');
      expect(wrapper.find('textarea').attributes('placeholder')).toContain('(optional)');
    });

    it('shows Deny confirm and Cancel buttons', async () => {
      const wrapper = mountRequestMessage();
      const denyButton = wrapper.findAll('button').find((b) => b.text() === 'Deny');
      await denyButton!.trigger('click');
      expect(wrapper.text()).toContain('Cancel');
    });
  });

  describe('when reject is confirmed', () => {
    it('emits reject with the reason', async () => {
      const wrapper = mountRequestMessage();
      const denyButton = wrapper.findAll('button').find((b) => b.text() === 'Deny');
      await denyButton!.trigger('click');

      await wrapper.find('textarea').setValue('Too risky');
      const confirmButton = wrapper.findAll('button').find((b) => b.text() === 'Deny');
      await confirmButton!.trigger('click');

      expect(wrapper.emitted('reject')).toEqual([['Too risky']]);
    });
  });

  describe('when Cancel is clicked after Deny', () => {
    it('hides the textarea and shows the approval buttons again', async () => {
      const wrapper = mountRequestMessage();
      const denyButton = wrapper.findAll('button').find((b) => b.text() === 'Deny');
      await denyButton!.trigger('click');

      const cancelButton = wrapper.findAll('button').find((b) => b.text() === 'Cancel');
      await cancelButton!.trigger('click');

      expect(wrapper.find('textarea').exists()).toBe(false);
      expect(wrapper.text()).toContain('Approve');
    });
  });

  describe('copyCode event', () => {
    it('bubbles copyCode from ApprovalDetails', () => {
      const wrapper = mountRequestMessage();
      wrapper.findComponent({ name: 'ApprovalDetails' }).vm.$emit('copyCode', 'some code');
      expect(wrapper.emitted('copyCode')).toEqual([['some code']]);
    });
  });
});
