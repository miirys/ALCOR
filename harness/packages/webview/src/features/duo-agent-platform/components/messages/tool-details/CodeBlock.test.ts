import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import CodeBlock from './CodeBlock.vue';

function mountCodeBlock(props: { code: string; language?: string }) {
  return mount(CodeBlock, { props });
}

describe('CodeBlock', () => {
  describe('rendering', () => {
    it('renders a <pre> with the code content', () => {
      const wrapper = mountCodeBlock({ code: 'const x = 1;' });
      expect(wrapper.find('pre').exists()).toBe(true);
      expect(wrapper.find('pre').text()).toContain('const x = 1;');
    });

    it('applies the language class when language is provided', () => {
      const wrapper = mountCodeBlock({ code: 'const x = 1;', language: 'js' });
      expect(wrapper.find('code').classes()).toContain('language-js');
    });

    it('does not apply a language class when language is not provided', () => {
      const wrapper = mountCodeBlock({ code: 'hello' });
      const classes = wrapper.find('code').classes();
      expect(classes.every((c) => !c.startsWith('language-'))).toBe(true);
    });

    it('renders the copy button', () => {
      const wrapper = mountCodeBlock({ code: 'hello' });
      expect(wrapper.find('button[aria-label="Copy to clipboard"]').exists()).toBe(true);
    });
  });

  describe('when the copy button is clicked', () => {
    it('emits copyCode with the code when the copy button is clicked', async () => {
      const wrapper = mountCodeBlock({ code: 'const x = 1;' });
      await wrapper.find('button[aria-label="Copy to clipboard"]').trigger('click');
      expect(wrapper.emitted('copyCode')).toEqual([['const x = 1;']]);
    });
  });
});
