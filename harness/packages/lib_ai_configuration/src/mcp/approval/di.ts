import { ServiceCollection } from '@gitlab/needle';
import { InMemoryMcpToolSessionApprovalStore } from './session';
import { DefaultMcpToolApprovalController } from './default_mcp_tool_approval_controller';
import {
  PersistentMcpServerApprovalStore,
  DefaultApprovalPolicy,
  type McpApprovalPolicy,
} from './server';

export type McpApprovalPolicyClass = new (...args: never[]) => McpApprovalPolicy;

export function registerMcpApprovalServices(
  serviceCollection: ServiceCollection,
  approvalPolicyClass: McpApprovalPolicyClass = DefaultApprovalPolicy,
) {
  serviceCollection.addClass(InMemoryMcpToolSessionApprovalStore);
  serviceCollection.addClass(DefaultMcpToolApprovalController);
  serviceCollection.addClass(PersistentMcpServerApprovalStore);
  serviceCollection.addClass(approvalPolicyClass);
}
