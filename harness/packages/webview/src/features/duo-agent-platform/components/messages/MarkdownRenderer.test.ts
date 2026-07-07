import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import MarkdownRenderer from './MarkdownRenderer.vue';

describe('MarkdownRenderer', () => {
  describe('when content is empty', () => {
    it('renders nothing for an empty string', () => {
      const wrapper = mount(MarkdownRenderer, { props: { content: '' } });
      expect(wrapper.find('.markdown-body').exists()).toBe(false);
    });

    it('renders nothing when content is undefined', () => {
      const wrapper = mount(MarkdownRenderer, { props: {} });
      expect(wrapper.find('.markdown-body').exists()).toBe(false);
    });

    it('renders nothing when content is null', () => {
      const wrapper = mount(MarkdownRenderer, { props: { content: null } });
      expect(wrapper.find('.markdown-body').exists()).toBe(false);
    });
  });

  describe('when content is plain text', () => {
    it('renders text wrapped in a paragraph', () => {
      const wrapper = mount(MarkdownRenderer, { props: { content: 'hello world' } });
      const root = wrapper.find('.markdown-body');
      expect(root.exists()).toBe(true);
      expect(root.html()).toContain('<p>hello world</p>');
    });
  });

  describe('when content contains a fenced code block', () => {
    it('renders a <pre><code> with hljs language classes', () => {
      const wrapper = mount(MarkdownRenderer, {
        props: { content: '```js\nconst x = 1;\n```' },
      });
      const html = wrapper.html();
      expect(html).toContain('<pre>');
      expect(html).toContain('hljs');
      expect(html).toContain('language-js');
    });
  });

  describe('when content contains malicious HTML', () => {
    it('strips <script> tags from the rendered output', () => {
      const wrapper = mount(MarkdownRenderer, {
        props: { content: 'hello <script>alert(1)</script> world' },
      });
      const html = wrapper.html();
      expect(html).not.toContain('<script>');
      expect(html).not.toContain('alert(1)');
    });

    it('strips inline event handlers from raw HTML', () => {
      const wrapper = mount(MarkdownRenderer, {
        props: { content: '<img src="x" onerror="alert(1)" />' },
      });
      expect(wrapper.html()).not.toContain('onerror');
    });
  });

  describe('when a link is clicked', () => {
    it('emits openUrl with the href for an external link and prevents navigation', async () => {
      const wrapper = mount(MarkdownRenderer, {
        props: { content: '[docs](https://docs.gitlab.com)' },
      });

      const event = new MouseEvent('click', { bubbles: true, cancelable: true });
      wrapper.get('a').element.dispatchEvent(event);
      await wrapper.vm.$nextTick();

      expect(wrapper.emitted('openUrl')).toEqual([['https://docs.gitlab.com']]);
      expect(event.defaultPrevented).toBe(true);
    });

    it('does not emit openUrl for same-origin links', async () => {
      const wrapper = mount(MarkdownRenderer, {
        props: { content: `[here](${window.location.origin}/page)` },
      });

      await wrapper.get('a').trigger('click');

      expect(wrapper.emitted('openUrl')).toBeUndefined();
    });

    it('ignores clicks that are not on a link', async () => {
      const wrapper = mount(MarkdownRenderer, { props: { content: 'plain text' } });

      await wrapper.get('.markdown-body').trigger('click');

      expect(wrapper.emitted('openUrl')).toBeUndefined();
    });
  });

  describe('when a code-block action is clicked', () => {
    const CODE_BLOCK = '```js\nconst x = 1;\n```';

    it('emits copyCode with the block code when copy is clicked', async () => {
      const wrapper = mount(MarkdownRenderer, { props: { content: CODE_BLOCK } });

      await wrapper.get('[data-code-action="copy"]').trigger('click');

      expect(wrapper.emitted('copyCode')).toEqual([['const x = 1;']]);
      expect(wrapper.emitted('insertCode')).toBeUndefined();
    });

    it('emits insertCode with the block code when insert is clicked', async () => {
      const wrapper = mount(MarkdownRenderer, { props: { content: CODE_BLOCK } });

      await wrapper.get('[data-code-action="insert"]').trigger('click');

      expect(wrapper.emitted('insertCode')).toEqual([['const x = 1;']]);
      expect(wrapper.emitted('copyCode')).toBeUndefined();
    });

    it('emits the code when the click lands on the icon inside the button', async () => {
      const wrapper = mount(MarkdownRenderer, { props: { content: CODE_BLOCK } });

      await wrapper.get('[data-code-action="copy"] svg').trigger('click');

      expect(wrapper.emitted('copyCode')).toEqual([['const x = 1;']]);
    });

    it('does not emit openUrl when an action is clicked', async () => {
      const wrapper = mount(MarkdownRenderer, { props: { content: CODE_BLOCK } });

      await wrapper.get('[data-code-action="insert"]').trigger('click');

      expect(wrapper.emitted('openUrl')).toBeUndefined();
    });
  });

  describe('when mounted with different content values', () => {
    it('renders updated markdown when re-mounted with new content', () => {
      const first = mount(MarkdownRenderer, { props: { content: 'first' } });
      expect(first.html()).toContain('<p>first</p>');

      const second = mount(MarkdownRenderer, { props: { content: '## second' } });
      expect(second.html()).toContain('<h2');
      expect(second.html()).toContain('second');
    });
  });
});
