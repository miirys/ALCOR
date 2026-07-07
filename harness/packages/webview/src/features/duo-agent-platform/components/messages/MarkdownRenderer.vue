<script setup lang="ts">
import { computed } from 'vue';
import { renderMarkdown } from '../../utils/renderMarkdown';
import { useEditorColorScheme } from '../../../../composables/useEditorColorScheme';

interface Props {
  content?: string | null;
}

const props = defineProps<Props>();
const emit = defineEmits<{
  openUrl: [url: string];
  copyCode: [code: string];
  insertCode: [code: string];
}>();

const html = computed(() => renderMarkdown(props.content));
const { isDark } = useEditorColorScheme();

function isExternalUrl(href: string): boolean {
  try {
    return new URL(href, window.location.href).origin !== window.location.origin;
  } catch {
    return false;
  }
}

// `v-html` content has no Vue bindings, so delegate its clicks from the container:
// toolbar buttons emit the block's code, external links are handed to the host.
function onClick(event: MouseEvent) {
  const target = event.target as Element | null;

  const action = target?.closest('[data-code-action]')?.getAttribute('data-code-action');
  if (action) {
    const code = target
      ?.closest('.code-block')
      ?.querySelector('code')
      ?.textContent?.replace(/\n$/, '');
    if (!code) {
      return;
    }

    if (action === 'insert') {
      emit('insertCode', code);
    } else if (action === 'copy') {
      emit('copyCode', code);
    }
    return;
  }

  const href = target?.closest('a')?.getAttribute('href');
  if (!href || !isExternalUrl(href)) {
    return;
  }
  event.preventDefault();
  emit('openUrl', href);
}
</script>

<template>
  <div
    v-if="html"
    class="markdown-body wrap-break-word"
    :class="{ 'is-dark': isDark }"
    v-html="html"
    @click="onClick"
  />
</template>

<style scoped>
/*
  Syntax-highlight palette (highlight.js token classes). Defaults to the
  light-theme colors (Atom One Light); `.is-dark` swaps in the dark variant
  (Atom One Dark). The active theme is detected from `--editor-background`,
  since the webview is sent only `--editor-*` color values, not a light/dark
  flag.
*/
.markdown-body {
  --hljs-comment: #a0a1a7;
  --hljs-keyword: #a626a4;
  --hljs-name: #e45649;
  --hljs-literal: #0184bb;
  --hljs-string: #50a14f;
  --hljs-number: #986801;
  --hljs-symbol: #4078f2;
  --hljs-built-in: #c18401;

  font-size: 1rem;
  line-height: 1.5;
}

.markdown-body.is-dark {
  --hljs-comment: #5c6370;
  --hljs-keyword: #c678dd;
  --hljs-name: #e06c75;
  --hljs-literal: #56b6c2;
  --hljs-string: #98c379;
  --hljs-number: #d19a66;
  --hljs-symbol: #61aeee;
  --hljs-built-in: #e6c07b;
}

.markdown-body :deep(p) {
  margin: 0 0 0.75rem 0;
}

.markdown-body :deep(p:last-child) {
  margin-bottom: 0;
}

.markdown-body :deep(h1),
.markdown-body :deep(h2),
.markdown-body :deep(h3),
.markdown-body :deep(h4),
.markdown-body :deep(h5),
.markdown-body :deep(h6) {
  font-weight: 600;
  line-height: 1.25;
  margin: 1rem 0 0.5rem 0;
}

.markdown-body :deep(h1) {
  font-size: 1.5rem;
}
.markdown-body :deep(h2) {
  font-size: 1.25rem;
}
.markdown-body :deep(h3) {
  font-size: 1.125rem;
}
.markdown-body :deep(h4),
.markdown-body :deep(h5),
.markdown-body :deep(h6) {
  font-size: 1rem;
}

.markdown-body :deep(ul),
.markdown-body :deep(ol) {
  margin: 0 0 0.75rem 0;
  padding-left: 1.5rem;
}

.markdown-body :deep(ul) {
  list-style: disc;
}

.markdown-body :deep(ol) {
  list-style: decimal;
}

.markdown-body :deep(li) {
  margin: 0.125rem 0;
}

.markdown-body :deep(li > p) {
  margin: 0;
}

.markdown-body :deep(a) {
  color: var(--editor-textLink-foreground, #1f75cb);
  text-decoration: underline;
}

.markdown-body :deep(blockquote) {
  border-left: 3px solid var(--editor-border-color, #d1d5db);
  padding: 0 0.75rem;
  margin: 0 0 0.75rem 0;
  color: var(--editor-foreground-muted, #6b7280);
}

.markdown-body :deep(code) {
  font-family:
    ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, 'Liberation Mono', monospace;
  font-size: 0.85em;
  padding: 0.1em 0.3em;
  border-radius: 0.25rem;
  background-color: var(--editor-textPreformat-background, rgba(127, 127, 127, 0.15));
  color: var(--editor-textPreformat-foreground, inherit);
}

.markdown-body :deep(pre) {
  margin: 0 0 0.75rem 0;
  padding: 0.75rem;
  border-radius: 0.375rem;
  max-height: 45rem;
  /*
    Wrap long lines instead of scrolling sideways, then scroll vertically once
    the block is tall. `overflow-x` must be `hidden` (not `visible`): a `visible`
    axis is computed to `auto` when the other axis scrolls, which would bring the
    horizontal scrollbar back.
  */
  overflow: hidden auto;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  border: 1px solid var(--editor-border-color, #d1d5db);
  background-color: var(--editor-textPreformat-background, #282c34);
  /*
    Base/unstyled tokens (punctuation, tag brackets, `.hljs-tag`) inherit this.
    Use the editor foreground rather than the inline-code accent
    (`--editor-textPreformat-foreground`), which is only guaranteed to contrast
    with the inline-code background and can be unreadable on the code-block
    background in high-contrast themes.
  */
  color: var(--editor-foreground, #abb2bf);
}

.markdown-body :deep(pre code) {
  background: transparent;
  padding: 0;
  border-radius: 0;
  font-size: 0.85em;
  color: inherit;
}

.markdown-body :deep(.code-block) {
  position: relative;
}

.markdown-body :deep(.code-block-toolbar) {
  position: absolute;
  top: 0.375rem;
  right: 0.375rem;
  display: flex;
  gap: 0.25rem;
  opacity: 0;
  transition: opacity 0.15s ease-in-out;
}

.markdown-body :deep(.code-block:hover .code-block-toolbar),
.markdown-body :deep(.code-block:focus-within .code-block-toolbar) {
  opacity: 1;
}

.markdown-body :deep(.code-block-action) {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0.5rem;
  line-height: 0;
  cursor: pointer;
  border: 1px solid var(--editor-border-color, #d1d5db);
  border-radius: 0.3rem;
  background-color: var(--editor-background, #282c34);
  color: var(--editor-foreground, #abb2bf);
}

.markdown-body :deep(.code-block-action:hover) {
  background-color: var(--editor-textPreformat-background, rgba(127, 127, 127, 0.15));
}

.markdown-body :deep(.code-block-action svg) {
  width: 1rem;
  height: 1rem;
}

/*
  CSS tooltip (the buttons are in `v-html`, so the shadcn `Tooltip` can't reach
  them). Reuses `aria-label` as the label and the shadcn primary colors. Anchored
  bottom-right so it can't overflow the block's edge.
*/
.markdown-body :deep(.code-block-action)::after {
  content: attr(aria-label);
  position: absolute;
  top: calc(100% + 0.375rem);
  right: 0;
  z-index: 10;
  padding: 0.25rem 0.5rem;
  border-radius: var(--radius-md, 0.375rem);
  background-color: var(--color-primary, #0e639c);
  color: var(--color-primary-foreground, #ffffff);
  font-size: 0.75rem;
  line-height: 1;
  white-space: nowrap;
  pointer-events: none;
  opacity: 0;
  transition: opacity 0.15s ease-in-out;
}

.markdown-body :deep(.code-block-action:hover)::after,
.markdown-body :deep(.code-block-action:focus-visible)::after {
  opacity: 1;
}

.markdown-body :deep(table) {
  border-collapse: collapse;
  margin: 0 0 0.75rem 0;
}

.markdown-body :deep(th),
.markdown-body :deep(td) {
  border: 1px solid var(--editor-border-color, #d1d5db);
  padding: 0.25rem 0.5rem;
}

.markdown-body :deep(hr) {
  border: 0;
  border-top: 1px solid var(--editor-border-color, #d1d5db);
  margin: 1rem 0;
}

.markdown-body :deep(img) {
  max-width: 100%;
  height: auto;
}

.markdown-body :deep(.hljs-comment),
.markdown-body :deep(.hljs-quote) {
  color: var(--hljs-comment);
  font-style: italic;
}

.markdown-body :deep(.hljs-doctag),
.markdown-body :deep(.hljs-keyword),
.markdown-body :deep(.hljs-formula) {
  color: var(--hljs-keyword);
}

.markdown-body :deep(.hljs-section),
.markdown-body :deep(.hljs-name),
.markdown-body :deep(.hljs-selector-tag),
.markdown-body :deep(.hljs-deletion),
.markdown-body :deep(.hljs-subst) {
  color: var(--hljs-name);
}

.markdown-body :deep(.hljs-literal) {
  color: var(--hljs-literal);
}

.markdown-body :deep(.hljs-string),
.markdown-body :deep(.hljs-regexp),
.markdown-body :deep(.hljs-addition),
.markdown-body :deep(.hljs-attribute),
.markdown-body :deep(.hljs-meta .hljs-string) {
  color: var(--hljs-string);
}

.markdown-body :deep(.hljs-attr),
.markdown-body :deep(.hljs-variable),
.markdown-body :deep(.hljs-template-variable),
.markdown-body :deep(.hljs-type),
.markdown-body :deep(.hljs-selector-class),
.markdown-body :deep(.hljs-selector-attr),
.markdown-body :deep(.hljs-selector-pseudo),
.markdown-body :deep(.hljs-number) {
  color: var(--hljs-number);
}

.markdown-body :deep(.hljs-symbol),
.markdown-body :deep(.hljs-bullet),
.markdown-body :deep(.hljs-link),
.markdown-body :deep(.hljs-meta),
.markdown-body :deep(.hljs-selector-id),
.markdown-body :deep(.hljs-title) {
  color: var(--hljs-symbol);
}

.markdown-body :deep(.hljs-built_in),
.markdown-body :deep(.hljs-title.class_),
.markdown-body :deep(.hljs-class .hljs-title) {
  color: var(--hljs-built-in);
}

.markdown-body :deep(.hljs-emphasis) {
  font-style: italic;
}

.markdown-body :deep(.hljs-strong) {
  font-weight: bold;
}

.markdown-body :deep(.hljs-link) {
  text-decoration: underline;
}
</style>
