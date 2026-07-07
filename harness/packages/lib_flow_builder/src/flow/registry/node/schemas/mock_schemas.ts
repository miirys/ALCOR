import type { JSONSchema7 } from 'json-schema';

/**
 * Mock Schemas for Flow V1 Component Types
 *
 * These schemas represent the ACTUAL output structure from the V1 flow engine,
 * based on the component implementations in duo_workflow_service/agent_platform/v1/.
 *
 * IMPORTANT NOTES:
 * - Agent input schemas are NOT included here - they should be derived from prompt templates
 * - Tool input/output schemas are NOT included here - they are derived at the tool layer
 * - These mocks will be replaced with backend-provided schemas once API is ready
 */

// =============================================================================
// AgentComponent Schemas
// =============================================================================

export const AGENT_OUTPUT_SCHEMA: JSONSchema7 = {
  type: 'object',
  properties: {
    final_answer: {
      type: 'string',
      description: "The agent's final response after completing its task",
    },
    conversation_history: {
      type: 'array',
      items: {
        type: 'object',
        description: 'LangChain BaseMessage objects containing the conversation',
      },
      description: 'Complete conversation history for this agent component',
    },
    status: {
      type: 'string',
      enum: ['in_progress', 'completed', 'failed'],
      description: 'Current workflow execution status',
    },
  },
  required: ['final_answer', 'status'],
};

// =============================================================================
// OneOffComponent (AI Task) Schemas
// =============================================================================

export const AI_TASK_OUTPUT_SCHEMA: JSONSchema7 = {
  type: 'object',
  properties: {
    tool_calls: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
          args: { type: 'object' },
        },
      },
      description: 'Record of all tool calls made during execution',
    },
    tool_responses: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          tool_call_id: { type: 'string' },
          content: { type: 'string' },
          status: { type: 'string', enum: ['success', 'error'] },
        },
      },
      description: 'Responses from all executed tools',
    },
    execution_result: {
      type: 'string',
      enum: ['success', 'failed'],
      description: 'Overall execution result - success if all tools executed, failed otherwise',
    },
    conversation_history: {
      type: 'array',
      items: { type: 'object' },
      description: 'Message history for this component (includes tool calls and responses)',
    },
  },
  required: ['execution_result'],
};

export const AI_TASK_INPUT_SCHEMA: JSONSchema7 = {
  type: 'object',
  properties: {
    goal: {
      type: 'string',
      description: 'Task description for the one-off AI operation',
    },
  },
  required: ['goal'],
};

// =============================================================================
// DeterministicStepComponent (Tool) Schemas
// =============================================================================

export const TOOL_OUTPUT_SCHEMA: JSONSchema7 = {
  type: 'object',
  properties: {
    tool_responses: {
      type: 'string',
      description: 'The output from the tool execution (typically a string)',
    },
    error: {
      type: 'string',
      description: 'Error message if the tool execution failed',
    },
    execution_result: {
      type: 'string',
      enum: ['success', 'failed'],
      description: 'Execution status - success or failed',
    },
  },
  required: ['execution_result'],
};

export const TOOL_INPUT_SCHEMA_PLACEHOLDER: JSONSchema7 = {
  type: 'object',
  description: 'Input schema varies by tool type and is derived from tool definition',
  additionalProperties: true,
};
