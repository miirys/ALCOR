import { ref, shallowRef, type Ref, type ShallowRef } from 'vue';
import type { Editor } from '@tiptap/core';
import { updatePillsForVar } from './pillOps';

/**
 * The pill currently being rewired. `originEditor` is the Tiptap instance the
 * user clicked in — only that editor's dropdown renders, so the other editor
 * doesn't show an overlapping popover.
 */
interface ActivePillEdit {
  varName: string;
  originEditor: Editor;
  pos: number;
}

/**
 * Cross-editor coordination for `PromptEditor.vue`'s two Tiptap instances.
 *
 * The system-prompt and user-prompt editors share one binding set at the node
 * level, so any state that spans both — which pill is being rewired, how many
 * times `{{varName}}` appears in total, and rewire dispatch — must live here.
 * Per-editor state (trigger, caret, dismissal) stays in `usePromptEditor`.
 */
export interface PromptEditorSession {
  /**
   * Exclusive across editors: setting this in one clears the dropdown in the
   * other. Uses `ShallowRef` so Vue doesn't deep-unwrap the `Editor` reference
   * it holds — that would both be wasteful and break structural typing.
   */
  activePillEdit: ShallowRef<ActivePillEdit | null>;
  /** varName → aggregated count across every registered editor. */
  siblingCounts: Ref<Map<string, number>>;
  /** Called when an editor mounts. */
  registerEditor(editor: Editor): void;
  /** Called when an editor is destroyed or swapped out. */
  unregisterEditor(editor: Editor): void;
  /** Each editor reports its local counts after `recountMergeFields`. */
  reportCounts(editor: Editor, counts: Map<string, number>): void;
  /** Update every pill matching `varName` across all registered editors. */
  rewireAll(varName: string, newAttrs: Partial<Record<string, unknown>>): void;
}

export const PROMPT_EDITOR_SESSION_KEY = Symbol('PromptEditorSession');

export function usePromptEditorSession(): PromptEditorSession {
  const activePillEdit = shallowRef<ActivePillEdit | null>(null);
  const siblingCounts = ref<Map<string, number>>(new Map());
  // Per-editor counts, kept in a plain Map — reactivity is driven by `siblingCounts`
  // which is re-assigned on every recompute.
  const perEditorCounts = new Map<Editor, Map<string, number>>();

  function recompute() {
    const next = new Map<string, number>();
    for (const counts of perEditorCounts.values()) {
      for (const [k, v] of counts) {
        next.set(k, (next.get(k) ?? 0) + v);
      }
    }
    siblingCounts.value = next;
  }

  return {
    activePillEdit,
    siblingCounts,
    registerEditor(editor) {
      perEditorCounts.set(editor, new Map());
    },
    unregisterEditor(editor) {
      if (perEditorCounts.delete(editor)) recompute();
      if (activePillEdit.value?.originEditor === editor) activePillEdit.value = null;
    },
    reportCounts(editor, counts) {
      perEditorCounts.set(editor, counts);
      recompute();
    },
    rewireAll(varName, newAttrs) {
      for (const editor of perEditorCounts.keys()) {
        updatePillsForVar(editor, varName, newAttrs);
      }
    },
  };
}
