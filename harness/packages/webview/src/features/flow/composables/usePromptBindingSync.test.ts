import { describe, it, expect, vi } from 'vitest';
import { computed, ref } from 'vue';
import type { InlinePromptDefinition, ParameterBinding } from '../types';
import { usePromptBindingSync } from './usePromptBindingSync';

function makePrompt(system: string, user: string): InlinePromptDefinition {
  return {
    name: 'test',
    promptTemplate: { system, user },
  };
}

describe('usePromptBindingSync', () => {
  describe('boundPaths', () => {
    it('maps reference bindings to a varName → path record', () => {
      const bindings = ref<ParameterBinding[]>([
        { parameter: 'goal', kind: 'reference', referencePath: 'context:goal' },
        { parameter: 'code', kind: 'reference', referencePath: 'context:a.final_answer' },
        { parameter: 'x', kind: 'unbound' },
        { parameter: 'y', kind: 'literal', literalValue: 'hi' },
      ]);
      const { boundPaths } = usePromptBindingSync({
        bindings: computed(() => bindings.value),
        localPrompt: computed(() => undefined),
        onBindingsChange: vi.fn(),
      });
      expect(boundPaths.value).toEqual({
        goal: 'context:goal',
        code: 'context:a.final_answer',
      });
    });
  });

  describe('promptVarNames', () => {
    it('extracts varNames from both system and user prompt text', () => {
      const prompt = ref<InlinePromptDefinition | undefined>(
        makePrompt('You are {{role}}.', 'Help with {{goal}} using {{code}}'),
      );
      const { promptVarNames } = usePromptBindingSync({
        bindings: computed(() => []),
        localPrompt: computed(() => prompt.value),
        onBindingsChange: vi.fn(),
      });
      expect(Array.from(promptVarNames.value).sort()).toEqual(['code', 'goal', 'role']);
    });

    it('returns empty set when localPrompt is undefined', () => {
      const { promptVarNames } = usePromptBindingSync({
        bindings: computed(() => []),
        localPrompt: computed(() => undefined),
        onBindingsChange: vi.fn(),
      });
      expect(promptVarNames.value.size).toBe(0);
    });
  });

  describe('handleBoundFieldsChange', () => {
    it('creates a new reference binding for a pill with a referencePath', () => {
      const prompt = makePrompt('', '{{goal}}');
      const onChange = vi.fn();
      const { handleBoundFieldsChange } = usePromptBindingSync({
        bindings: computed(() => []),
        localPrompt: computed(() => prompt),
        onBindingsChange: onChange,
      });
      handleBoundFieldsChange([{ varName: 'goal', referencePath: 'context:goal' }]);
      expect(onChange).toHaveBeenCalledWith([
        { parameter: 'goal', kind: 'reference', referencePath: 'context:goal' },
      ]);
    });

    it('creates an unbound binding for a pill with null referencePath', () => {
      const prompt = makePrompt('', '{{custom}}');
      const onChange = vi.fn();
      const { handleBoundFieldsChange } = usePromptBindingSync({
        bindings: computed(() => []),
        localPrompt: computed(() => prompt),
        onBindingsChange: onChange,
      });
      handleBoundFieldsChange([{ varName: 'custom', referencePath: null }]);
      expect(onChange).toHaveBeenCalledWith([{ parameter: 'custom', kind: 'unbound' }]);
    });

    it('does NOT mutate the existing binding object when updating', () => {
      const original: ParameterBinding = {
        parameter: 'goal',
        kind: 'unbound',
      };
      const prompt = makePrompt('', '{{goal}}');
      const onChange = vi.fn();
      const { handleBoundFieldsChange } = usePromptBindingSync({
        bindings: computed(() => [original]),
        localPrompt: computed(() => prompt),
        onBindingsChange: onChange,
      });
      handleBoundFieldsChange([{ varName: 'goal', referencePath: 'context:goal' }]);
      // Original object is not mutated
      expect(original.kind).toBe('unbound');
      // New binding is emitted
      expect(onChange).toHaveBeenCalledWith([
        { parameter: 'goal', kind: 'reference', referencePath: 'context:goal' },
      ]);
    });

    it('removes bindings whose variable is no longer in the prompt text', () => {
      const prompt = makePrompt('', '{{goal}}'); // "old" is gone
      const onChange = vi.fn();
      const { handleBoundFieldsChange } = usePromptBindingSync({
        bindings: computed(() => [
          { parameter: 'goal', kind: 'reference', referencePath: 'context:goal' },
          { parameter: 'old', kind: 'reference', referencePath: 'context:old' },
        ]),
        localPrompt: computed(() => prompt),
        onBindingsChange: onChange,
      });
      handleBoundFieldsChange([{ varName: 'goal', referencePath: 'context:goal' }]);
      expect(onChange).toHaveBeenCalledWith([
        { parameter: 'goal', kind: 'reference', referencePath: 'context:goal' },
      ]);
    });

    it('preserves bindings in extraKeepParams even when absent from prompt text', () => {
      // Simulates switching to local mode while remote-mode bindings should persist
      const prompt = makePrompt('', '{{goal}}');
      const onChange = vi.fn();
      const { handleBoundFieldsChange } = usePromptBindingSync({
        bindings: computed(() => [
          { parameter: 'goal', kind: 'reference', referencePath: 'context:goal' },
          { parameter: 'remote_only', kind: 'reference', referencePath: 'context:x' },
        ]),
        localPrompt: computed(() => prompt),
        extraKeepParams: computed(() => new Set(['remote_only'])),
        onBindingsChange: onChange,
      });
      handleBoundFieldsChange([{ varName: 'goal', referencePath: 'context:goal' }]);
      // Should NOT call onChange because nothing changed
      expect(onChange).not.toHaveBeenCalled();
    });

    it('does not call onBindingsChange when nothing changed', () => {
      const prompt = makePrompt('', '{{goal}}');
      const onChange = vi.fn();
      const { handleBoundFieldsChange } = usePromptBindingSync({
        bindings: computed(() => [
          { parameter: 'goal', kind: 'reference', referencePath: 'context:goal' },
        ]),
        localPrompt: computed(() => prompt),
        onBindingsChange: onChange,
      });
      handleBoundFieldsChange([{ varName: 'goal', referencePath: 'context:goal' }]);
      expect(onChange).not.toHaveBeenCalled();
    });

    it('updates existing binding when referencePath changes', () => {
      const prompt = makePrompt('', '{{goal}}');
      const onChange = vi.fn();
      const { handleBoundFieldsChange } = usePromptBindingSync({
        bindings: computed(() => [
          { parameter: 'goal', kind: 'reference', referencePath: 'context:goal' },
        ]),
        localPrompt: computed(() => prompt),
        onBindingsChange: onChange,
      });
      handleBoundFieldsChange([{ varName: 'goal', referencePath: 'context:different' }]);
      expect(onChange).toHaveBeenCalledWith([
        { parameter: 'goal', kind: 'reference', referencePath: 'context:different' },
      ]);
    });

    it('transitions an unbound binding to reference when pill gets wired', () => {
      const prompt = makePrompt('', '{{goal}}');
      const onChange = vi.fn();
      const { handleBoundFieldsChange } = usePromptBindingSync({
        bindings: computed(() => [{ parameter: 'goal', kind: 'unbound' }]),
        localPrompt: computed(() => prompt),
        onBindingsChange: onChange,
      });
      handleBoundFieldsChange([{ varName: 'goal', referencePath: 'context:goal' }]);
      expect(onChange).toHaveBeenCalledWith([
        { parameter: 'goal', kind: 'reference', referencePath: 'context:goal' },
      ]);
    });

    it('downgrades a reference binding to unbound when the pill loses its referencePath', () => {
      const prompt = makePrompt('', '{{goal}}');
      const onChange = vi.fn();
      const { handleBoundFieldsChange } = usePromptBindingSync({
        bindings: computed(() => [
          { parameter: 'goal', kind: 'reference', referencePath: 'context:goal' },
        ]),
        localPrompt: computed(() => prompt),
        onBindingsChange: onChange,
      });
      handleBoundFieldsChange([{ varName: 'goal', referencePath: null }]);
      expect(onChange).toHaveBeenCalledWith([{ parameter: 'goal', kind: 'unbound' }]);
    });

    it('preserves a literal binding when the pill has null referencePath', () => {
      const prompt = makePrompt('', '{{x}}');
      const onChange = vi.fn();
      const { handleBoundFieldsChange } = usePromptBindingSync({
        bindings: computed(() => [{ parameter: 'x', kind: 'literal', literalValue: 'hello' }]),
        localPrompt: computed(() => prompt),
        onBindingsChange: onChange,
      });
      handleBoundFieldsChange([{ varName: 'x', referencePath: null }]);
      expect(onChange).not.toHaveBeenCalled();
    });
  });
});
