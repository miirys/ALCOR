import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import ToolApprovalDetails from './ToolApprovalDetails.vue';

function mountApproval(props: { toolName?: string; args?: Record<string, unknown> }) {
  return mount(ToolApprovalDetails, {
    props: {
      toolName: 'create_issue',
      args: {},
      ...props,
    },
  });
}

describe('ToolApprovalDetails', () => {
  describe('metadata badges', () => {
    it('renders MetadataBadges when args contain metadata fields', () => {
      const wrapper = mountApproval({ args: { project_path: 'gitlab-org/gitlab' } });
      expect(wrapper.text()).toContain('Project: gitlab-org/gitlab');
    });

    it('renders nothing for metadata when args is empty', () => {
      const wrapper = mountApproval({ args: {} });
      expect(wrapper.findComponent({ name: 'MetadataBadges' }).exists()).toBe(true);
    });
  });

  describe('title', () => {
    it('renders the title when args.title is present', () => {
      const wrapper = mountApproval({ args: { title: 'My issue title' } });
      expect(wrapper.text()).toContain('My issue title');
    });

    it('does not render the title paragraph when args.title is absent', () => {
      const wrapper = mountApproval({ args: {} });
      expect(wrapper.find('p').exists()).toBe(false);
    });
  });

  describe('description collapsible', () => {
    it('renders the Read description trigger when args.description is present', () => {
      const wrapper = mountApproval({ args: { description: 'Some description' } });
      expect(wrapper.text()).toContain('Read description');
    });

    it('does not render the Read description trigger when args.description is absent', () => {
      const wrapper = mountApproval({ args: {} });
      expect(wrapper.text()).not.toContain('Read description');
    });

    it('uses args.body as description fallback', () => {
      const wrapper = mountApproval({ args: { body: 'Body text' } });
      expect(wrapper.text()).toContain('Read description');
    });

    it('uses args.comment as description fallback', () => {
      const wrapper = mountApproval({ args: { comment: 'Comment text' } });
      expect(wrapper.text()).toContain('Read description');
    });
  });

  describe('request parameters JSON collapsible', () => {
    it('always renders the See request parameters as JSON trigger', () => {
      const wrapper = mountApproval({ args: { foo: 'bar' } });
      expect(wrapper.text()).toContain('See request parameters as JSON');
    });

    it('renders the trigger even when args is empty', () => {
      const wrapper = mountApproval({ args: {} });
      expect(wrapper.text()).toContain('See request parameters as JSON');
    });
  });

  describe('copyCode event', () => {
    it('bubbles copyCode from the description CodeBlock when opened', async () => {
      const wrapper = mountApproval({ args: { description: 'Some description' } });
      await wrapper.find('button').trigger('click');
      wrapper.findComponent({ name: 'CodeBlock' }).vm.$emit('copyCode', 'desc content');
      expect(wrapper.emitted('copyCode')).toEqual([['desc content']]);
    });

    it('bubbles copyCode from the JSON CodeBlock when opened', async () => {
      const wrapper = mountApproval({ args: { foo: 'bar' } });
      await wrapper.find('button').trigger('click');
      wrapper.findComponent({ name: 'CodeBlock' }).vm.$emit('copyCode', '{"foo":"bar"}');
      expect(wrapper.emitted('copyCode')).toEqual([['{"foo":"bar"}']]);
    });
  });
});
