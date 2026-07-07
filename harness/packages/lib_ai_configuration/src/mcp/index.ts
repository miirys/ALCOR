export {
  McpToolApprovalController,
  McpToolSessionApprovalStore,
  McpServerApprovalStore,
  McpApprovalPolicy,
  DefaultApprovalPolicy,
  AutoApproveApprovalPolicy,
} from './approval';

export {
  McpStdioCommandTransformer,
  type StdioLaunchParams,
} from './transport/stdio_command_transformer';
export * from './types';
export { McpManager } from './manager';
export type {
  ServerConfig,
  StdioServerConfig,
  SseServerConfig,
  StreamableHttpServerConfig,
} from './config';
export { McpConfigWriter } from './config';
export { ConnectionState } from './client';
export {
  McpManagerWorkflowExecutorAdaptor,
  MCP_TOOL_FAILURE_PREFIX,
} from './workflow_executor_adaptor';
export { WorkflowUrlOpenerService } from './url_opener_service';
export { getMcpConfigPathCandidates } from './utils';

/** LSP notification name for pending MCP server approvals */
export const MCP_SERVERS_NEED_APPROVAL_NOTIFICATION = '$/gitlab/mcp/serversNeedApproval' as const;
