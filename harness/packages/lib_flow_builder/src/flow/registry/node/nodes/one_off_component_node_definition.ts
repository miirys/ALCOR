import type { NodeTypeDefinition } from '../../../types';
import { AI_TASK_INPUT_SCHEMA, AI_TASK_OUTPUT_SCHEMA } from '../schemas';

export const OneOffStepComponentNodeTypeDefinition: NodeTypeDefinition = {
  type: 'ai-task',
  label: 'AI Task',
  description: 'Single round AI operation with tool execution',
  ui: {
    color: '#8b5cf6',
    icon: '⚡',
  },
  inputSchema: AI_TASK_INPUT_SCHEMA,
  outputSchema: AI_TASK_OUTPUT_SCHEMA,
};
