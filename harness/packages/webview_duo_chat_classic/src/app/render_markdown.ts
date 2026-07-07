import { addDuoMarkdownPlugin } from '@gitlab/duo-ui';
import { marked, MarkedExtension, RendererApi } from 'marked';
import { markedHighlight } from 'marked-highlight';
import hljs from 'highlight.js';

type CodeArgs = Parameters<RendererApi['code']>;

function addActionButtons(): MarkedExtension {
  const insertCodeSnippetButton = '<insert-code-snippet></insert-code-snippet>';
  const copyCodeButton = '<copy-code></copy-code>';
  return {
    renderer: {
      code(...args: CodeArgs) {
        const html = marked.Renderer.prototype.code.call(this, ...args);
        return `<div class="gl-relative markdown-code-block js-markdown-code">${html}${copyCodeButton}${insertCodeSnippetButton}</div>`;
      },
    },
  };
}

addDuoMarkdownPlugin(
  markedHighlight({
    langPrefix: 'hljs language-',
    highlight(code, lang) {
      const language = hljs.getLanguage(lang) ? lang : 'plaintext';
      return hljs.highlight(code, { language }).value;
    },
  }),
);

addDuoMarkdownPlugin(addActionButtons());
