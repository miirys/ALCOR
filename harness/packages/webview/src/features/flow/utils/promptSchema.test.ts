import { describe, it, expect } from 'vitest';
import type { InlinePromptDefinition } from '../types';
import { extractPromptVariables, buildPromptInputSchema } from './promptSchema';

function makePrompt(system: string, user: string): InlinePromptDefinition {
  return {
    name: 'test',
    promptTemplate: { system, user },
  };
}

describe('extractPromptVariables', () => {
  it('extracts variables from system and user prompts', () => {
    const prompt = makePrompt(
      'You are a {{role}} assistant.',
      'Please help with {{goal}} using {{context}}.',
    );
    expect(extractPromptVariables(prompt)).toEqual(
      expect.arrayContaining(['role', 'goal', 'context']),
    );
    expect(extractPromptVariables(prompt)).toHaveLength(3);
  });

  it('deduplicates repeated variables', () => {
    const prompt = makePrompt('{{goal}} is important', 'Achieve {{goal}}');
    expect(extractPromptVariables(prompt)).toEqual(['goal']);
  });

  it('always excludes history — runtime-injected by the engine', () => {
    const prompt = makePrompt('{{role}}', '{{history}} {{goal}}');
    const vars = extractPromptVariables(prompt);
    expect(vars).toContain('role');
    expect(vars).toContain('goal');
    expect(vars).not.toContain('history');
  });

  it('returns empty array when no variables found', () => {
    const prompt = makePrompt('You are helpful.', 'Do the thing.');
    expect(extractPromptVariables(prompt)).toEqual([]);
  });

  it('handles empty prompt strings', () => {
    const prompt = makePrompt('', '');
    expect(extractPromptVariables(prompt)).toEqual([]);
  });

  it('only matches word characters inside braces', () => {
    const prompt = makePrompt('{{valid_var}}', '{{123abc}} {{a-b}}');
    const vars = extractPromptVariables(prompt);
    expect(vars).toContain('valid_var');
    expect(vars).toContain('123abc');
    // {{a-b}} does not match \w+ so should not be extracted
    expect(vars).not.toContain('a-b');
  });
});

describe('buildPromptInputSchema', () => {
  it('returns null for empty variables', () => {
    expect(buildPromptInputSchema([])).toBeNull();
  });

  it('builds a valid JSON Schema from variables', () => {
    const schema = buildPromptInputSchema(['goal', 'context']);
    expect(schema).toEqual({
      type: 'object',
      properties: {
        goal: { type: 'string', description: 'Prompt variable: goal' },
        context: { type: 'string', description: 'Prompt variable: context' },
      },
      required: ['goal', 'context'],
    });
  });

  it('builds schema for a single variable', () => {
    const schema = buildPromptInputSchema(['goal']);
    expect(schema).not.toBeNull();
    expect(schema!.required).toEqual(['goal']);
    expect(Object.keys(schema!.properties as object)).toEqual(['goal']);
  });
});
