import { ServiceCollection } from '@gitlab/needle';
import { registerMcpConfigService } from './config';
import { registerMcpAuthServices } from './auth';
import { registerMcpClientServices } from './client';
import { registerMcpApprovalServices } from './approval';
import type { McpApprovalPolicyClass } from './approval/di';
import { McpManager } from './manager';
import { McpManagerWorkflowExecutorAdaptor } from './workflow_executor_adaptor';
import { McpServerSessionManagerFactory } from './server_session_manager_factory';

export function registerMcpServices(
  serviceCollection: ServiceCollection,
  approvalPolicyClass?: McpApprovalPolicyClass,
): ServiceCollection {
  registerMcpConfigService(serviceCollection);
  registerMcpAuthServices(serviceCollection);
  registerMcpClientServices(serviceCollection);
  registerMcpApprovalServices(serviceCollection, approvalPolicyClass);

  serviceCollection.addClass(McpServerSessionManagerFactory);
  serviceCollection.addClass(McpManager);
  serviceCollection.addClass(McpManagerWorkflowExecutorAdaptor);

  return serviceCollection;
}
