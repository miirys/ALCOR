import { Marked } from 'marked';
import { markedHighlight } from 'marked-highlight';
import hljs from 'highlight.js/lib/common';
import DOMPurify from 'dompurify';

/**
 * A local `marked` instance configured with syntax highlighting.
 * `highlight.js/lib/common` registers the ~35 most common languages rather than
 * the full ~190-language bundle; unknown languages fall back to plaintext.
 */
const markedInstance = new Marked(
  markedHighlight({
    langPrefix: 'hljs language-',
    highlight(code, lang) {
      const language = hljs.getLanguage(lang) ? lang : 'plaintext';
      return hljs.highlight(code, { language }).value;
    },
  }),
);

// Inline lucide icons: the toolbar is an HTML string, so it can't use Vue components.
const COPY_ICON =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"></rect><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"></path></svg>';
const INSERT_ICON =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 11V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.706.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-1"></path><path d="M14 2v5a1 1 0 0 0 1 1h5"></path><path d="M2 15h10"></path><path d="m9 18 3-3-3-3"></path></svg>';

const CODE_BLOCK_TOOLBAR =
  '<div class="code-block-toolbar">' +
  `<button type="button" class="code-block-action" data-code-action="copy" aria-label="Copy to clipboard">${COPY_ICON}</button>` +
  `<button type="button" class="code-block-action" data-code-action="insert" aria-label="Insert at cursor">${INSERT_ICON}</button>` +
  '</div>';

// Wrap each fenced code block with the Copy/Insert toolbar. The token is already
// highlighted by `markedHighlight` (so `escaped` is true); we just re-emit its
// `<pre><code>` and add the toolbar around it.
markedInstance.use({
  renderer: {
    code(code: string, infoString: string | undefined, escaped: boolean): string {
      const lang = (infoString ?? '').match(/\S*/)?.[0] ?? '';
      const classAttr = lang ? ` class="hljs language-${escapeHtml(lang)}"` : '';
      const body = (escaped ? code : escapeHtml(code)).replace(/\n$/, '');
      return `<div class="code-block">${CODE_BLOCK_TOOLBAR}<pre><code${classAttr}>${body}\n</code></pre></div>`;
    },
  },
});

/**
 * A scoped DOMPurify instance. Hooks are registered per-instance, so owning our
 * own instance keeps the link-hardening hook from leaking into other DOMPurify
 * consumers in the bundle.
 */
const purify = DOMPurify(window);

/**
 * Defense-in-depth for agent-authored links: should a click ever reach the
 * anchor instead of being intercepted and routed to the host (see
 * `MarkdownRenderer`), `noopener noreferrer` severs its access to the opener.
 */
purify.addHook('afterSanitizeAttributes', (node) => {
  if (node.tagName === 'A' && node.hasAttribute('href')) {
    node.setAttribute('target', '_blank');
    node.setAttribute('rel', 'noopener noreferrer');
  }
});

/**
 * Render a markdown string to a sanitized HTML string.
 *
 * The output is sanitized with DOMPurify before being returned. Callers can
 * safely render the result with `v-html`.
 *
 * Returns an empty string when given empty/undefined input.
 * Falls back to an HTML-escaped version of the input if parsing throws.
 */
export function renderMarkdown(content: string | null | undefined): string {
  if (!content) {
    return '';
  }

  try {
    const html = markedInstance.parse(content, { async: false }) as string;
    return purify.sanitize(html);
  } catch {
    return escapeHtml(content);
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
