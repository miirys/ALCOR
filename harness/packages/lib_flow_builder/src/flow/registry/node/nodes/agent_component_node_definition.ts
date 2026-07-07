import type { NodeTypeDefinition } from '../../../types';
import { AGENT_OUTPUT_SCHEMA } from '../schemas';

export const AgentComponentNodeTypeDefinition: NodeTypeDefinition = {
  type: 'agent',
  description: 'AI agent that can reason and use tools',
  label: 'Agent',
  ui: {
    color: '#3b82f6',
    icon: '🤖',
  },
  outputSchema: AGENT_OUTPUT_SCHEMA,
  inputSchema: undefined, // Derived from prompt template
};
