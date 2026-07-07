import type { JSONSchema7 } from 'json-schema';
import type { InlinePromptDefinition } from '../types';
import { MERGE_FIELD_TOKEN_GLOBAL } from '../components/forms/promptEditor/extensions';

/** Extract `{{variable}}` names from a prompt template's system + user text. */
export function extractPromptVariables(prompt: InlinePromptDefinition): string[] {
  const text = `${prompt.promptTemplate.system} ${prompt.promptTemplate.user}`;
  const vars = new Set<string>();
  for (const match of text.matchAll(MERGE_FIELD_TOKEN_GLOBAL)) {
    vars.add(match[1] as string);
  }
  // Exclude 'history' — always runtime-injected by the engine, never a user input
  vars.delete('history');
  return [...vars];
}

/** Build a JSON Schema from variable names (all typed as string). Returns null if empty. */
export function buildPromptInputSchema(variables: string[]): JSONSchema7 | null {
  if (variables.length === 0) return null;
  return {
    type: 'object',
    properties: Object.fromEntries(
      variables.map((v) => [v, { type: 'string' as const, description: `Prompt variable: ${v}` }]),
    ),
    required: variables,
  };
}
