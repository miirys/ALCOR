/// <reference lib="es2022" />
import { z } from 'zod';
import { err, ok, Result } from 'neverthrow';
import { DuoWorkflowEvent } from './workflow_message_types';

// Zod schemas for workflow checkpoint messages
// Args can have different structures depending on the tool type
const ToolInfoArgsSchema = z.record(z.string(), z.unknown());

const ToolResponseSchema = z.object({
  content: z.string(),
  additional_kwargs: z.record(z.string(), z.unknown()),
  response_metadata: z.record(z.string(), z.unknown()),
  type: z.string(),
  name: z.string(),
  id: z.string().nullable(),
  tool_call_id: z.string(),
  artifact: z.unknown(),
  status: z.string(),
});

const ToolInfoSchema = z.object({
  name: z.string(),
  args: ToolInfoArgsSchema,
  // tool_response is a string when the tool throws an error, otherwise it's an object with status and artifact
  tool_response: z.union([ToolResponseSchema, z.string()]).optional(),
  // Glob patterns suggested by the backend for pattern-based session approvals
  // e.g. ["git checkout *", "git *"] for a run_command tool call
  suggested_patterns: z.array(z.string()).optional(),
});

// Base fields shared by all message types
const BaseMessageSchema = z.object({
  message_id: z.string().optional(),
  message_sub_type: z.string().nullable(),
  content: z.string(),
  timestamp: z.string(),
  status: z.string().nullable(),
  correlation_id: z.string().nullable(),
  additional_context: z.unknown(),
});

// User and agent messages (no tool_info)
export const WorkflowMessageSchema = BaseMessageSchema.extend({
  message_type: z.enum(['user', 'agent']),
  tool_info: z.null(),
});

// Plan approval request messages (from HumanInputComponent with interaction_type: 'approval')
// tool_info is null for plan approval requests
export const WorkflowPlanApprovalRequestSchema = BaseMessageSchema.extend({
  message_type: z.literal('request'),
  message_sub_type: z.literal('approval'),
  tool_info: z.null(),
});

// Tool approval request messages
export const WorkflowRequestSchema = BaseMessageSchema.extend({
  message_type: z.literal('request'),
  tool_info: ToolInfoSchema,
});

// Tool execution output messages
export const WorkflowToolSchema = BaseMessageSchema.extend({
  message_type: z.literal('tool'),
  tool_info: z.union([ToolInfoSchema, z.null()]),
});

// Union of all message types.
// Note: two 'request' sub-types exist (tool approval and plan approval), so we cannot use
// z.discriminatedUnion on message_type alone. z.union tries schemas in order, so
// WorkflowPlanApprovalRequestSchema (more specific: message_sub_type: 'approval', tool_info: null)
// must come before WorkflowRequestSchema (tool approval with non-null tool_info).
export const ChatLogSchema = z.union([
  WorkflowMessageSchema,
  WorkflowPlanApprovalRequestSchema,
  WorkflowRequestSchema,
  WorkflowToolSchema,
]);

export type WorkflowMessage = z.infer<typeof WorkflowMessageSchema>;
export type WorkflowPlanApprovalRequest = z.infer<typeof WorkflowPlanApprovalRequestSchema>;
export type WorkflowRequest = z.infer<typeof WorkflowRequestSchema>;
export type WorkflowTool = z.infer<typeof WorkflowToolSchema>;
export type ChatLog = z.infer<typeof ChatLogSchema>;

export function isPlanApprovalRequest(entry: ChatLog): entry is WorkflowPlanApprovalRequest {
  return (
    entry.message_type === 'request' &&
    entry.message_sub_type === 'approval' &&
    entry.tool_info === null
  );
}

interface CheckpointData {
  channel_values: {
    ui_chat_log?: unknown[];
    plan?: {
      steps: unknown[];
    };
    [key: string]: unknown;
  };
}

export function extractUiChatLog(message: DuoWorkflowEvent): Result<ChatLog[], Error> {
  if (!message.checkpoint) return ok([]);

  let checkpoint: CheckpointData;
  try {
    checkpoint = JSON.parse(message.checkpoint);
  } catch (e: unknown) {
    const error = new Error(
      `Failed to parse a workflow checkpoint. Checkpoint: ${message.checkpoint}`,
      { cause: e },
    );
    return err(error);
  }

  if (
    !checkpoint.channel_values?.ui_chat_log ||
    !Array.isArray(checkpoint.channel_values.ui_chat_log)
  ) {
    return ok([]);
  }

  // Validate each message with zod schema
  const validatedMessages: ChatLog[] = [];
  for (let i = 0; i < checkpoint.channel_values.ui_chat_log.length; i++) {
    const rawMessage = checkpoint.channel_values.ui_chat_log[i];
    const parseResult = ChatLogSchema.safeParse(rawMessage);

    if (!parseResult.success) {
      return err(
        new Error(
          `Failed to validate message at index ${i}: ${parseResult.error.message}. Raw message: ${JSON.stringify(rawMessage)}`,
        ),
      );
    }

    validatedMessages.push(parseResult.data);
  }

  return ok(validatedMessages);
}
