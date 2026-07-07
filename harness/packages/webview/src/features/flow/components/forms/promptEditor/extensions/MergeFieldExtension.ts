import { Node, mergeAttributes, InputRule } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Slice, Fragment } from '@tiptap/pm/model';
import { VueNodeViewRenderer } from '@tiptap/vue-3';
import MergeFieldPill from '../MergeFieldPill.vue';
import { MERGE_FIELD_TOKEN_SPLIT, MERGE_FIELD_TOKEN_TAIL } from './mergeFieldTokens';
import { createUnknownMergeFieldAttrs } from './mergeFieldAttrs';

export interface MergeFieldSuggestionItem {
  /** Internal context path, e.g. "context:nodeId.final_answer" or "context:goal" */
  path: string;
  /** Short variable name used in the prompt text, e.g. "final_answer" or "goal" */
  varName: string;
  displayLabel: string;
  sourceNodeLabel: string;
  sourceNodeType: string;
  fieldName: string;
  schemaType?: string;
  description?: string;
}

export interface MergeFieldTriggerState {
  active: boolean;
  range: { from: number; to: number } | null;
  query: string;
}

const mergeFieldTriggerKey = new PluginKey<MergeFieldTriggerState>('mergeFieldTrigger');

export function getMergeFieldTriggerState(editor: {
  state: Parameters<typeof mergeFieldTriggerKey.getState>[0];
}): MergeFieldTriggerState | null {
  return mergeFieldTriggerKey.getState(editor.state) ?? null;
}

export interface MergeFieldExtensionOptions {
  /** Called when a keyboard shortcut fires while the suggestion trigger is active. */
  onKeyDown?: (event: KeyboardEvent) => boolean;
}

export const MergeFieldExtension = Node.create<MergeFieldExtensionOptions>({
  name: 'mergeField',

  addOptions() {
    return { onKeyDown: undefined };
  },
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,
  draggable: false,

  addAttributes() {
    return {
      // Internal context path — persisted for binding sync, never serialized to text
      path: {
        default: '',
        parseHTML: (element) => element.getAttribute('data-path') ?? '',
        renderHTML: (attributes) => ({ 'data-path': attributes.path }),
      },
      // Short variable name — what gets emitted to the prompt text as {{varName}}
      varName: {
        default: '',
        parseHTML: (element) => element.getAttribute('data-var-name') ?? '',
        renderHTML: (attributes) => ({ 'data-var-name': attributes.varName }),
      },
      displayLabel: {
        default: '',
        parseHTML: (element) => element.getAttribute('data-display-label') ?? '',
        renderHTML: (attributes) => ({ 'data-display-label': attributes.displayLabel }),
      },
      sourceNodeType: {
        default: '',
        parseHTML: (element) => element.getAttribute('data-source-node-type') ?? '',
        renderHTML: (attributes) => ({ 'data-source-node-type': attributes.sourceNodeType }),
      },
      status: {
        default: 'unknown',
        parseHTML: (element) => element.getAttribute('data-status') ?? 'unknown',
        renderHTML: (attributes) => ({ 'data-status': attributes.status }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'span[data-type="mergeField"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'span',
      mergeAttributes({ 'data-type': 'mergeField' }, HTMLAttributes),
      `{{${HTMLAttributes['data-var-name'] ?? HTMLAttributes['data-path'] ?? ''}}}`,
    ];
  },

  addNodeView() {
    return VueNodeViewRenderer(MergeFieldPill);
  },

  addInputRules() {
    return [
      // Converts typed {{word}} into an unknown-status merge field node
      new InputRule({
        find: MERGE_FIELD_TOKEN_TAIL,
        handler: ({ state, range, match }) => {
          const varName = match[1] ?? '';
          const node = state.schema.nodes[this.name]?.create(createUnknownMergeFieldAttrs(varName));
          if (!node) return;
          const { tr } = state;
          tr.replaceWith(range.from, range.to, node);
        },
      }),
    ];
  },

  addProseMirrorPlugins() {
    const mergeFieldType = this.type;
    const { onKeyDown } = this.options;

    return [
      new Plugin<MergeFieldTriggerState>({
        key: mergeFieldTriggerKey,

        state: {
          init: () => ({ active: false, range: null, query: '' }),

          apply(tr, prev) {
            if (!tr.docChanged && !tr.selectionSet) return prev;

            const { $from } = tr.selection;
            if (!$from.parent.isTextblock) return { active: false, range: null, query: '' };

            const textBefore = $from.doc.textBetween($from.before(), $from.pos, '\0', '\0');
            const match = textBefore.match(/\{\{([^\s}]*)$/);

            if (!match) return { active: false, range: null, query: '' };

            return {
              active: true,
              range: { from: $from.pos - match[0].length, to: $from.pos },
              query: match[1] ?? '',
            };
          },
        },

        props: {
          // Intercept keys at the view level — runs before any keymap plugin,
          // so Enter/Arrow/Escape reach the suggestion list instead of ProseMirror.
          handleKeyDown: (view, event) => {
            const triggerActive = mergeFieldTriggerKey.getState(view.state)?.active;
            if (!triggerActive) return false;
            const keys = new Set(['Enter', 'ArrowUp', 'ArrowDown', 'Escape']);
            if (!keys.has(event.key)) return false;
            return onKeyDown?.(event) ?? false;
          },
        },
      }),

      // Convert {{token}} patterns in pasted plain text into mergeField nodes
      new Plugin({
        props: {
          clipboardTextParser(text, $context) {
            const { schema } = $context.doc.type;
            const paragraphs = text.split(/\n\n/);
            const pNodes = paragraphs.map((block) => {
              const segments = block.split(MERGE_FIELD_TOKEN_SPLIT);
              const inlineNodes: import('@tiptap/pm/model').Node[] = [];
              for (const seg of segments) {
                if (seg === '') {
                  // skip empty segments produced by split
                } else if (MERGE_FIELD_TOKEN_SPLIT.test(seg)) {
                  const varName = seg.slice(2, -2);
                  inlineNodes.push(mergeFieldType.create(createUnknownMergeFieldAttrs(varName)));
                } else {
                  const lines = seg.split('\n');
                  for (let i = 0; i < lines.length; i += 1) {
                    if (i > 0 && schema.nodes.hardBreak) {
                      inlineNodes.push(schema.nodes.hardBreak.create());
                    }
                    const line = lines[i];
                    if (line) {
                      inlineNodes.push(schema.text(line));
                    }
                  }
                }
              }
              const paragraphType = schema.nodes.paragraph;
              if (!paragraphType) return null;
              return paragraphType.create(null, inlineNodes.length > 0 ? inlineNodes : undefined);
            });
            const validNodes = pNodes.filter(
              (n): n is import('@tiptap/pm/model').Node => n !== null,
            );
            return Slice.maxOpen(Fragment.from(validNodes));
          },
        },
      }),
    ];
  },
});
