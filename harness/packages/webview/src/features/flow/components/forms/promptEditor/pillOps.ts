import type { Editor } from '@tiptap/core';

/**
 * Update every merge-field pill matching `varName` in a single editor's doc.
 *
 * Positions are collected up-front to stay resilient if the schema ever makes
 * mergeField non-atom (atoms don't shift on `setNodeMarkup`, but the reverse
 * iteration + tr.mapping keeps this correct either way). Returns true when
 * at least one pill was updated.
 */
export function updatePillsForVar(
  ed: Editor,
  varName: string,
  newAttrs: Partial<Record<string, unknown>>,
): boolean {
  const targets: { pos: number; attrs: Record<string, unknown> }[] = [];
  ed.state.doc.descendants((node, pos) => {
    if (node.type.name === 'mergeField' && node.attrs.varName === varName) {
      targets.push({ pos, attrs: { ...node.attrs, ...newAttrs } });
    }
  });
  if (targets.length === 0) return false;

  const { tr } = ed.state;
  for (let i = targets.length - 1; i >= 0; i -= 1) {
    const t = targets[i];
    if (t) tr.setNodeMarkup(tr.mapping.map(t.pos), undefined, t.attrs);
  }
  ed.view.dispatch(tr);
  return true;
}
