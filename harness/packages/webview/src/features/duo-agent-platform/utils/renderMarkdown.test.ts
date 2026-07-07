import { describe, it, expect } from 'vitest';
import { renderMarkdown } from './renderMarkdown';

describe('renderMarkdown', () => {
  describe('when content is empty', () => {
    it('returns an empty string for an empty string', () => {
      expect(renderMarkdown('')).toBe('');
    });

    it('returns an empty string for null', () => {
      expect(renderMarkdown(null)).toBe('');
    });

    it('returns an empty string for undefined', () => {
      expect(renderMarkdown(undefined)).toBe('');
    });
  });

  describe('when content is plain text', () => {
    it('wraps text in a paragraph', () => {
      const html = renderMarkdown('hello world');
      expect(html).toContain('<p>hello world</p>');
    });
  });

  describe('when content contains a heading', () => {
    it('renders the heading element', () => {
      const html = renderMarkdown('## My Heading');
      expect(html).toContain('<h2');
      expect(html).toContain('My Heading');
    });
  });

  describe('when content contains a fenced code block', () => {
    it('produces a <pre><code> with hljs language classes', () => {
      const html = renderMarkdown('```js\nconst x = 1;\n```');
      expect(html).toContain('<pre>');
      expect(html).toContain('<code');
      expect(html).toContain('hljs');
      expect(html).toContain('language-js');
    });

    it('falls back to plaintext for unknown languages', () => {
      const html = renderMarkdown('```not-a-real-lang\nfoo\n```');
      expect(html).toContain('<pre>');
      expect(html).toContain('<code');
      // Marked still preserves the original lang class from langPrefix.
      expect(html).toContain('hljs');
    });

    it('wraps the block in a toolbar with copy and insert actions', () => {
      const html = renderMarkdown('```js\nconst x = 1;\n```');
      expect(html).toContain('class="code-block"');
      expect(html).toContain('data-code-action="copy"');
      expect(html).toContain('data-code-action="insert"');
    });

    it('keeps the action buttons and their icons through sanitization', () => {
      const html = renderMarkdown('```js\nconst x = 1;\n```');
      expect(html).toContain('<button');
      expect(html).toContain('aria-label="Copy to clipboard"');
      expect(html).toContain('aria-label="Insert at cursor"');
      expect(html).toContain('<svg');
    });
  });

  describe('when content contains lists', () => {
    it('renders unordered lists', () => {
      const html = renderMarkdown('- one\n- two\n');
      expect(html).toContain('<ul>');
      expect(html).toContain('<li>one</li>');
      expect(html).toContain('<li>two</li>');
    });
  });

  describe('when content contains malicious HTML', () => {
    it('strips <script> tags', () => {
      const html = renderMarkdown('hello <script>alert(1)</script> world');
      expect(html).not.toContain('<script>');
      expect(html).not.toContain('alert(1)');
    });

    it('strips inline event handlers from raw HTML', () => {
      const html = renderMarkdown('<img src="x" onerror="alert(1)" />');
      expect(html).not.toContain('onerror');
    });

    it('strips javascript: links', () => {
      const html = renderMarkdown('[click me](javascript:alert(1))');
      expect(html).not.toMatch(/href\s*=\s*["']javascript:/i);
    });
  });

  describe('when content contains links', () => {
    it('hardens links to open in a new context without opener access', () => {
      const html = renderMarkdown('[docs](https://docs.gitlab.com)');
      expect(html).toContain('target="_blank"');
      expect(html).toContain('rel="noopener noreferrer"');
    });
  });
});
