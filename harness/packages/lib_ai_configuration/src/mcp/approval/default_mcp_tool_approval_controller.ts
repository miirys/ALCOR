import { Implements, Service, ServiceLifetime } from '@gitlab/needle';
import { McpToolName, WorkflowId } from '../types';
import { McpToolSessionApprovalStore } from './session';
import { McpToolApprovalController } from './types';

@Implements(McpToolApprovalController)
@Service({
  dependencies: [McpToolSessionApprovalStore],
  lifetime: ServiceLifetime.Singleton,
})
export class DefaultMcpToolApprovalController implements McpToolApprovalController {
  #store: McpToolSessionApprovalStore;

  constructor(store: McpToolSessionApprovalStore) {
    this.#store = store;
  }

  async approveToolForSession(workflowId: WorkflowId, toolName: McpToolName): Promise<void> {
    const address = McpToolName.parse(toolName);
    await this.#store.approveTool(workflowId, address);
  }
}
