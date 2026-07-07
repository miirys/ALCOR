import type { JSONContent } from '@tiptap/vue-3';
import { MERGE_FIELD_TOKEN_SPLIT, createUnknownMergeFieldAttrs } from './extensions';

export interface MergeFieldAttrs {
  path: string;
  varName: string;
  displayLabel: string;
  sourceNodeType: string;
  status: 'valid' | 'broken' | 'type-mismatch' | 'unknown' | 'runtime';
}

/**
 * Serialize a Tiptap doc to a plain-text prompt template.
 *
 * Merge field nodes are emitted as {{varName}} — the short variable name the
 * backend template engine will substitute. The internal `path` (context ref)
 * is NOT included in the text; it is carried only in the parameter bindings.
 */
export function serializeDoc(doc: JSONContent): string {
  const paragraphs = (doc.content ?? [])
    .filter((node) => node.type === 'paragraph')
    .map(serializeParagraph);

  return paragraphs.join('\n\n').trimEnd();
}

function serializeParagraph(paragraph: JSONContent): string {
  if (!paragraph.content) return '';

  return paragraph.content.reduce((acc, node) => {
    switch (node.type) {
      case 'text':
        return acc + (node.text ?? '');
      case 'hardBreak':
        return `${acc}\n`;
      case 'mergeField':
        // Emit the short variable name, not the internal context path
        return `${acc}{{${(node.attrs?.varName || node.attrs?.path) ?? ''}}}`;
      default:
        return acc;
    }
  }, '');
}

/**
 * Deserialize a plain-text prompt template back to a Tiptap doc.
 *
 * Each {{token}} becomes a mergeField node. The `hydrate` callback resolves
 * the token to display attributes; tokens that don't resolve get status='unknown'.
 */
export function deserializeDoc(
  template: string,
  hydrate?: (varName: string) => MergeFieldAttrs | null,
): JSONContent {
  if (template === '') {
    return { type: 'doc', content: [{ type: 'paragraph' }] };
  }

  const paragraphs: JSONContent[] = template.split('\n\n').map((block) => {
    const content = deserializeParagraphContent(block, hydrate);
    return content.length > 0 ? { type: 'paragraph', content } : { type: 'paragraph' };
  });

  return { type: 'doc', content: paragraphs };
}

function deserializeParagraphContent(
  block: string,
  hydrate?: (varName: string) => MergeFieldAttrs | null,
): JSONContent[] {
  const content: JSONContent[] = [];

  for (const segment of block.split(MERGE_FIELD_TOKEN_SPLIT)) {
    if (segment === '') {
      // skip empty segments produced by split
    } else if (MERGE_FIELD_TOKEN_SPLIT.test(segment)) {
      const varName = segment.slice(2, -2);
      const attrs = hydrate?.(varName);
      content.push({
        type: 'mergeField',
        attrs: attrs ?? createUnknownMergeFieldAttrs(varName),
      });
    } else {
      const lines = segment.split('\n');
      for (let i = 0; i < lines.length; i += 1) {
        if (i > 0) content.push({ type: 'hardBreak' });
        if (lines[i] !== '') content.push({ type: 'text', text: lines[i] });
      }
    }
  }

  return content;
}
