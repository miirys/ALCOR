import { computed, type ComputedRef } from 'vue';
import type { InlinePromptDefinition, ParameterBinding } from '../types';
import type { BoundField } from '../components/forms/promptEditor/usePromptEditor';
import { MERGE_FIELD_TOKEN_GLOBAL } from '../components/forms/promptEditor/extensions';

/**
 * Shared logic for syncing parameter bindings with an inline prompt editor.
 *
 * Used by node forms (AgentNodeForm, AiTaskNodeForm) that host a PromptEditor.
 * Centralizes:
 *   - `boundPaths`: map of varName → referencePath for pill hydration
 *   - `promptVarNames`: set of {{varName}} tokens currently in the prompt text
 *   - `handleBoundFieldsChange`: diff incoming pill state against existing
 *      bindings and persist the delta via an immutable array update
 *
 * The mode-aware `extraKeepParams` option preserves bindings that belong to
 * another mode (e.g. remote-mode dynamicInputParams while editing locally)
 * so switching modes doesn't strip the inactive mode's bindings.
 */
export function usePromptBindingSync(options: {
  /** Reactive current bindings on the node. */
  bindings: ComputedRef<ParameterBinding[]>;
  /** Reactive local prompt — used to derive which variables exist in the text. */
  localPrompt: ComputedRef<InlinePromptDefinition | undefined>;
  /** Additional parameter names to keep even when absent from the prompt text. */
  extraKeepParams?: ComputedRef<Set<string>>;
  /** Called to persist an updated binding array. */
  onBindingsChange: (next: ParameterBinding[]) => void;
}) {
  const boundPaths = computed<Record<string, string>>(() => {
    const result: Record<string, string> = {};
    for (const b of options.bindings.value) {
      if (b.kind === 'reference' && b.referencePath) {
        result[b.parameter] = b.referencePath;
      }
    }
    return result;
  });

  /**
   * Variable names extracted from the serialized prompt text (both system and user).
   *
   * The prompt text is the authoritative source for which variables exist —
   * BoundField[] emissions from usePromptEditor may be partial when the two
   * editor instances fire independently during mount or node-switch.
   */
  const promptVarNames = computed<Set<string>>(() => {
    const prompt = options.localPrompt.value;
    if (!prompt) return new Set();
    const text = `${prompt.promptTemplate.system}\n${prompt.promptTemplate.user}`;
    const set = new Set<string>();
    for (const m of text.matchAll(MERGE_FIELD_TOKEN_GLOBAL)) {
      if (m[1]) set.add(m[1]);
    }
    return set;
  });

  function handleBoundFieldsChange(fields: BoundField[]) {
    const existing = options.bindings.value;
    const textVars = promptVarNames.value;
    const keepExtras = options.extraKeepParams?.value ?? new Set<string>();

    // Build the next binding list immutably — never mutate existing entries
    // because they are the reactive objects from the store.
    const next: ParameterBinding[] = [];
    let changed = false;

    // Keep bindings that belong to the current prompt OR another mode.
    for (const b of existing) {
      if (textVars.has(b.parameter) || keepExtras.has(b.parameter)) {
        next.push(b);
      } else {
        changed = true;
      }
    }

    // Apply incoming pill changes via immutable splices.
    for (const field of fields) {
      const idx = next.findIndex((b) => b.parameter === field.varName);
      const prev = idx >= 0 ? next[idx] : undefined;

      if (field.referencePath) {
        if (!prev) {
          next.push({
            parameter: field.varName,
            kind: 'reference',
            referencePath: field.referencePath,
          });
          changed = true;
        } else if (prev.kind !== 'reference' || prev.referencePath !== field.referencePath) {
          next[idx] = {
            ...prev,
            kind: 'reference',
            referencePath: field.referencePath,
          };
          changed = true;
        }
      } else if (!prev) {
        next.push({ parameter: field.varName, kind: 'unbound' });
        changed = true;
      } else if (prev.kind === 'reference') {
        // Literals are preserved — a null path only invalidates reference bindings.
        next[idx] = { parameter: field.varName, kind: 'unbound' };
        changed = true;
      }
    }

    if (changed) {
      options.onBindingsChange(next);
    }
  }

  return {
    boundPaths,
    promptVarNames,
    handleBoundFieldsChange,
  };
}
