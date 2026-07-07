import { GraphQLOperation } from '../types';
import {
  AiChatAvailableModelsQuery,
  AiChatFoundationalAgentsQuery,
  DeleteDuoWorkflowsWorkflowMutation,
  UpdateToolCallApprovalsMutation,
  UpdateAgentPrivilegesMutation,
} from './ai';
import { DuoWorkflowWorkflowsQuery } from './ai/workflows';
import { GetUserProjectPermissionsQuery } from './project';

export * from './ai';
export * from './project';

export const KnownGraphQLOperations: Record<string, GraphQLOperation<unknown>> = {
  aiChatAvailableModels: AiChatAvailableModelsQuery,
  aiFoundationalAgents: AiChatFoundationalAgentsQuery,
  duoWorkflows: DuoWorkflowWorkflowsQuery,
  deleteWorkflow: DeleteDuoWorkflowsWorkflowMutation,
  updateToolCallApprovals: UpdateToolCallApprovalsMutation,
  updateAgentPrivileges: UpdateAgentPrivilegesMutation,
  getUserProjectPermissions: GetUserProjectPermissionsQuery,
};
