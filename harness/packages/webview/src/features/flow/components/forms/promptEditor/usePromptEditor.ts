import { watch, ref, readonly, computed, toValue, type Ref, type ComputedRef } from 'vue';
import { useEditor } from '@tiptap/vue-3';
import type { Editor } from '@tiptap/core';
import { NodeSelection } from '@tiptap/pm/state';
import StarterKit from '@tiptap/starter-kit';
import type { AvailableOutput } from '../../../utils/outputCatalog';
import { MergeFieldExtension, getMergeFieldTriggerState, deriveVarName } from './extensions';
import type { MergeFieldSuggestionItem, MergeFieldTriggerState } from './extensions';
import { hydrateMergeField } from './hydrateMergeField';
import { serializeDoc, deserializeDoc } from './promptSerialization';
import type { MergeFieldAttrs } from './promptSerialization';
import type { PromptEditorSession } from './usePromptEditorSession';

export interface BoundField {
  varName: string;
  /** Null for 'unknown' status variables — they have no upstream path yet. */
  referencePath: string | null;
}

interface PillEditState {
  varName: string;
  pos: number;
}

function filterItems(items: MergeFieldSuggestionItem[], query: string): MergeFieldSuggestionItem[] {
  if (!query) return items;
  const lower = query.toLowerCase();
  return items.filter(
    (item) =>
      item.displayLabel.toLowerCase().includes(lower) ||
      item.fieldName.toLowerCase().includes(lower) ||
      item.sourceNodeLabel.toLowerCase().includes(lower),
  );
}

export function usePromptEditor(options: {
  content: Ref<string> | ComputedRef<string>;
  availableOutputs: ComputedRef<AvailableOutput[]>;
  /** Pre-existing parameter bindings: varName → referencePath */
  boundPaths?: ComputedRef<Record<string, string>>;
  editable?: Ref<boolean> | boolean;
  /** Cross-editor coordinator shared with any sibling editors. */
  session: PromptEditorSession;
  onUpdate?: (content: string) => void;
  /** Called whenever the set of bound fields changes (insert or delete pill). */
  onBoundFieldsChange?: (fields: BoundField[]) => void;
  /** Keyboard handler for suggestion dropdown — called from ProseMirror plugin level. */
  onSuggestionKeyDown?: (event: KeyboardEvent) => boolean;
}) {
  const { session } = options;
  const isInternalUpdate = ref(false);
  const mergeFieldCount = ref(0);
  const brokenCount = ref(0);
  const unknownCount = ref(0);
  const triggerState = ref<MergeFieldTriggerState>({ active: false, range: null, query: '' });
  const manualOpen = ref(false);
  // Escape-dismisses the trigger at a specific `{{` position; a fresh trigger
  // elsewhere reopens because `dismissedTriggerFrom` clears on deactivation.
  const dismissedTriggerFrom = ref<number | null>(null);

  function hydrate(varName: string): MergeFieldAttrs {
    return hydrateMergeField(varName, {
      availableOutputs: options.availableOutputs.value,
      boundPaths: options.boundPaths?.value,
    });
  }

  function collectBoundFields(ed: Editor): BoundField[] {
    // Dedup by varName — if {{goal}} appears N times, emit one BoundField.
    // A reference path always wins over null (the first referenced instance sets the path).
    const byVar = new Map<string, BoundField>();
    ed.state.doc.descendants((node) => {
      if (node.type.name !== 'mergeField') return;
      const { varName, path, status } = node.attrs;
      if (!varName) return;
      const referencePath = status !== 'unknown' && path !== varName ? (path as string) : null;
      const existing = byVar.get(varName);
      if (!existing || (referencePath !== null && existing.referencePath === null)) {
        byVar.set(varName, { varName, referencePath });
      }
    });
    return Array.from(byVar.values());
  }

  function recountMergeFields(ed: Editor) {
    let fields = 0;
    let broken = 0;
    let unknown = 0;
    const localCounts = new Map<string, number>();
    ed.state.doc.descendants((node) => {
      if (node.type.name !== 'mergeField') return;
      fields += 1;
      if (node.attrs.status === 'broken') broken += 1;
      else if (node.attrs.status === 'unknown') unknown += 1;
      const varName = node.attrs.varName as string;
      if (varName) localCounts.set(varName, (localCounts.get(varName) ?? 0) + 1);
    });
    mergeFieldCount.value = fields;
    brokenCount.value = broken;
    unknownCount.value = unknown;
    session.reportCounts(ed, localCounts);
  }

  function mapOutputsToSuggestionItems(): MergeFieldSuggestionItem[] {
    return options.availableOutputs.value.map((output) => {
      const arrowIndex = output.label.indexOf(' → ');
      const fieldName = arrowIndex >= 0 ? output.label.slice(arrowIndex + 3) : output.label;
      return {
        path: output.path,
        varName: deriveVarName(output.path),
        displayLabel: output.label,
        sourceNodeLabel: output.sourceNodeLabel,
        sourceNodeType: output.sourceNodeType,
        fieldName,
        schemaType: typeof output.schemaType === 'string' ? output.schemaType : undefined,
        description: output.description,
      };
    });
  }

  const suggestionItems = computed(() => {
    const items = mapOutputsToSuggestionItems();
    if (!triggerState.value.active) return items;
    return filterItems(items, triggerState.value.query);
  });

  // Captured in onCreate, cleared in onDestroy — stable reference for session
  // unregistration even if the reactive `editor` ref has already been cleared.
  let registeredEditor: Editor | null = null;

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        bold: false,
        italic: false,
        strike: false,
        code: false,
        codeBlock: false,
        blockquote: false,
        bulletList: false,
        orderedList: false,
        listItem: false,
        heading: false,
        horizontalRule: false,
      }),
      MergeFieldExtension.configure({
        onKeyDown: (event: KeyboardEvent) => options.onSuggestionKeyDown?.(event) ?? false,
      }),
    ],
    editable: toValue(options.editable ?? true),
    content: deserializeDoc(options.content.value, hydrate),
    onCreate({ editor: ed }) {
      registeredEditor = ed;
      session.registerEditor(ed);
      recountMergeFields(ed);
      // Establish bindings for pills that were hydrated from existing content.
      // onUpdate is only fired when content changes, so without this call, pills
      // loaded on initial mount (or after a node switch) would never register
      // their resolved paths as parameter bindings.
      options.onBoundFieldsChange?.(collectBoundFields(ed));
    },
    onDestroy() {
      // `editor.value` may already be cleared by Tiptap's unmount, so keep a
      // local reference captured in onCreate.
      if (registeredEditor) {
        session.unregisterEditor(registeredEditor);
        registeredEditor = null;
      }
    },
    onUpdate({ editor: ed }) {
      isInternalUpdate.value = true;
      options.onUpdate?.(serializeDoc(ed.getJSON()));
      recountMergeFields(ed);
      options.onBoundFieldsChange?.(collectBoundFields(ed));
      isInternalUpdate.value = false;
    },
    onTransaction({ editor: ed }) {
      const state = getMergeFieldTriggerState(ed);
      if (state) triggerState.value = state;

      const { selection } = ed.state;
      const active = session.activePillEdit.value;
      const activeIsOurs = active?.originEditor === ed;
      if (selection instanceof NodeSelection && selection.node.type.name === 'mergeField') {
        const newPos = selection.from;
        if (!activeIsOurs || active?.pos !== newPos) {
          session.activePillEdit.value = {
            varName: (selection.node.attrs.varName as string) ?? '',
            originEditor: ed,
            pos: newPos,
          };
          manualOpen.value = false;
        }
      } else if (activeIsOurs && !triggerState.value.active) {
        session.activePillEdit.value = null;
      }
    },
  });

  /** Session's active pill edit, filtered to this editor (null when another owns it). */
  const pillEditState = computed<PillEditState | null>(() => {
    const active = session.activePillEdit.value;
    const ed = editor.value;
    if (!active || !ed || active.originEditor !== ed) return null;
    return { varName: active.varName, pos: active.pos };
  });

  const suggestionsOpen = computed(() => {
    const { active, range } = triggerState.value;
    const dismissedHere = active && range?.from === dismissedTriggerFrom.value;
    return (active && !dismissedHere) || pillEditState.value !== null || manualOpen.value;
  });

  /** When a pill is selected for rewiring, provides context for the dropdown header. */
  const editingContext = computed(() => {
    const local = pillEditState.value;
    if (!local?.varName) return null;
    return {
      varName: local.varName,
      instanceCount: session.siblingCounts.value.get(local.varName) ?? 0,
    };
  });

  function insertMergeField(item: MergeFieldSuggestionItem) {
    const ed = editor.value;
    if (!ed) return;

    const attrs = {
      path: item.path,
      varName: item.varName,
      displayLabel: item.displayLabel,
      sourceNodeType: item.sourceNodeType,
      status: 'valid' as const,
    };

    // Snapshot trigger state BEFORE dispatching anything — the chain below
    // fires transactions that will mutate reactive state mid-execution.
    const triggerRange = triggerState.value.active ? triggerState.value.range : null;
    const editingVarName = pillEditState.value?.varName ?? null;

    if (triggerRange) {
      ed.chain()
        .focus()
        .deleteRange(triggerRange)
        .insertContent({ type: 'mergeField', attrs })
        .run();
    } else if (editingVarName) {
      // Configure mode: update ALL pills sharing this varName across every
      // registered editor — the core invariant is that all `{{varName}}`
      // instances share a single binding regardless of which prompt they
      // appear in.
      session.rewireAll(editingVarName, {
        path: item.path,
        displayLabel: item.displayLabel,
        sourceNodeType: item.sourceNodeType,
        status: 'valid',
      });
      session.activePillEdit.value = null;
    } else {
      ed.chain().focus().insertContent({ type: 'mergeField', attrs }).run();
    }

    closeSuggestions();
  }

  function closeSuggestions() {
    const ed = editor.value;
    if (triggerState.value.active && triggerState.value.range) {
      dismissedTriggerFrom.value = triggerState.value.range.from;
    }
    if (ed && session.activePillEdit.value?.originEditor === ed) {
      session.activePillEdit.value = null;
    }
    manualOpen.value = false;
  }

  watch(
    () => triggerState.value.active,
    (active) => {
      if (!active) dismissedTriggerFrom.value = null;
    },
  );

  // Sync external content changes (e.g. switching nodes). Content replacement
  // is a boundary event — clear every per-editor UI state so the new node's
  // content doesn't inherit a stale trigger, dismissed position, or rewire.
  watch(options.content, (newContent) => {
    if (isInternalUpdate.value) return;
    const ed = editor.value;
    if (!ed || ed.isDestroyed) return;
    if (serializeDoc(ed.getJSON()) === newContent) return;
    ed.commands.setContent(deserializeDoc(newContent, hydrate));
    triggerState.value = { active: false, range: null, query: '' };
    dismissedTriggerFrom.value = null;
    manualOpen.value = false;
    if (session.activePillEdit.value?.originEditor === ed) {
      session.activePillEdit.value = null;
    }
  });

  // Sync editable prop
  if (typeof options.editable === 'object' && 'value' in options.editable) {
    watch(options.editable, (val) => editor.value?.setEditable(val));
  }

  // Re-validate all merge field pills in the editor against the current hydration context.
  // Called when either upstream outputs or parameter bindings change, since both affect
  // whether a {{variable}} resolves to a valid reference or stays unknown/broken.
  function revalidatePills() {
    const ed = editor.value;
    if (!ed || ed.isDestroyed) return;

    // Guard against stale-content side effects during a node switch.
    //
    // When the selected node changes, `boundPaths` and `availableOutputs` both
    // update before the content watcher has had a chance to load the new node's
    // prompt into the editor. If we revalidate now, we'd walk the *previous*
    // node's pills under the new node's context, then propagate that stale
    // content back via onUpdate → onBoundFieldsChange. Returning early is safe:
    // the content watcher fires shortly after and triggers a full re-render.
    if (serializeDoc(ed.getJSON()) !== toValue(options.content)) return;

    // Collect changes first, then apply — avoids walking the doc while mutating.
    const changes: { pos: number; attrs: Record<string, unknown> }[] = [];
    ed.state.doc.descendants((node, pos) => {
      if (node.type.name !== 'mergeField') return;
      const newAttrs = hydrate(node.attrs.varName ?? node.attrs.path);
      if (
        node.attrs.status !== newAttrs.status ||
        node.attrs.displayLabel !== newAttrs.displayLabel ||
        node.attrs.path !== newAttrs.path
      ) {
        changes.push({ pos, attrs: { ...node.attrs, ...newAttrs } });
      }
    });

    if (changes.length > 0) {
      const { tr } = ed.state;
      for (let i = changes.length - 1; i >= 0; i -= 1) {
        const c = changes[i];
        if (c) tr.setNodeMarkup(tr.mapping.map(c.pos), undefined, c.attrs);
      }
      ed.view.dispatch(tr);
      options.onBoundFieldsChange?.(collectBoundFields(ed));
    }

    // Always recount — even when no pills changed, the editor may have been
    // loaded with content identical to the previous node (e.g. both empty).
    // Without this, counts from the previous node persist as stale state.
    recountMergeFields(ed);
  }

  watch(options.availableOutputs, revalidatePills);

  // When parameter bindings change externally (e.g. user wires a {{variable}}
  // via the Inputs section), re-validate so the pill updates from unknown → valid.
  if (options.boundPaths) {
    watch(options.boundPaths, revalidatePills);
  }

  return {
    editor,
    mergeFieldCount: readonly(mergeFieldCount),
    brokenCount: readonly(brokenCount),
    unknownCount: readonly(unknownCount),
    triggerState: readonly(triggerState),
    pillEditState,
    editingContext,
    suggestionItems,
    suggestionsOpen,
    insertMergeField,
    closeSuggestions,
  };
}
