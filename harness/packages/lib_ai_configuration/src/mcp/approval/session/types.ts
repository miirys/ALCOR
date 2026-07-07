import { createInterfaceId } from '@gitlab/needle';
import { McpToolAddress, ServerName, WorkflowId } from '../../types';

export interface McpToolSessionApprovalStore {
  approveTool(workflowId: WorkflowId, address: McpToolAddress): Promise<void>;
  revokeTool(workflowId: WorkflowId, address: McpToolAddress): Promise<void>;
  revokeToolsForWorkflow(workflowId: WorkflowId): Promise<void>;
  revokeToolsForServer(server: ServerName): Promise<void>;
  revokeToolsForServerInWorkflow(workflowId: WorkflowId, server: ServerName): Promise<void>;

  /** Convenience for internal checks and tests */
  isToolApproved(workflowId: WorkflowId, address: McpToolAddress): boolean;
}

export const McpToolSessionApprovalStore = createInterfaceId<McpToolSessionApprovalStore>(
  'McpToolSessionApprovalStore',
);
