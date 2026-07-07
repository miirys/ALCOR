import { createInterfaceId } from '@gitlab/needle';
import { WorkflowId, McpToolName } from '../types';

export interface McpToolApprovalController {
  approveToolForSession(workflowId: WorkflowId, toolName: McpToolName): Promise<void>;
}

export const McpToolApprovalController = createInterfaceId<McpToolApprovalController>(
  'McpToolApprovalController',
);
