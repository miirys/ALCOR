import type { NodeTypeDefinition } from '../../../types';
import { TOOL_INPUT_SCHEMA_PLACEHOLDER, TOOL_OUTPUT_SCHEMA } from '../schemas';

export const DeterministicStepComponentNodeTypeDefinition: NodeTypeDefinition = {
  type: 'tool',
  label: 'Tool',
  description: 'Execute a specific tool deterministically',
  ui: {
    color: '#6366f1',
    icon: '⚙️',
  },
  inputSchema: TOOL_INPUT_SCHEMA_PLACEHOLDER,
  outputSchema: TOOL_OUTPUT_SCHEMA,
};
