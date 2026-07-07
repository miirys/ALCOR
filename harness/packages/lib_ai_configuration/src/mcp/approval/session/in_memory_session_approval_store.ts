import { Implements, Service, ServiceLifetime } from '@gitlab/needle';
import type { McpToolAddress, ServerName, WorkflowId } from '../../types';
import { McpToolSessionApprovalStore } from './types';

type ToolName = McpToolAddress['toolName'];
type ServerTools = Map<ServerName, Set<ToolName>>;

@Implements(McpToolSessionApprovalStore)
@Service({
  dependencies: [],
  lifetime: ServiceLifetime.Singleton,
})
export class InMemoryMcpToolSessionApprovalStore implements McpToolSessionApprovalStore {
  #approvals = new Map<WorkflowId, ServerTools>();

  async approveTool(workflowId: WorkflowId, address: McpToolAddress): Promise<void> {
    const serverMap = this.#ensureWorkflow(workflowId);
    const toolSet = this.#ensureServer(serverMap, address.serverName);
    toolSet.add(address.toolName);
  }

  async revokeTool(
    workflowId: WorkflowId,
    { serverName, toolName }: McpToolAddress,
  ): Promise<void> {
    const serverMap = this.#approvals.get(workflowId);
    if (!serverMap) return;

    const toolSet = serverMap.get(serverName);
    if (!toolSet) return;

    toolSet.delete(toolName);
    if (toolSet.size === 0) {
      serverMap.delete(serverName);

      if (serverMap.size === 0) {
        this.#approvals.delete(workflowId);
      }
    }
  }

  async revokeToolsForWorkflow(workflowId: WorkflowId): Promise<void> {
    this.#approvals.delete(workflowId);
  }

  async revokeToolsForServer(serverName: ServerName): Promise<void> {
    for (const [workflowId, serverMap] of this.#approvals) {
      if (serverMap.has(serverName)) {
        serverMap.delete(serverName);
        if (serverMap.size === 0) this.#approvals.delete(workflowId);
      }
    }
  }

  async revokeToolsForServerInWorkflow(workflowId: WorkflowId, server: ServerName): Promise<void> {
    const serverMap = this.#approvals.get(workflowId);
    if (!serverMap) return;
    serverMap.delete(server);
    if (serverMap.size === 0) this.#approvals.delete(workflowId);
  }

  isToolApproved(workflowId: WorkflowId, address: McpToolAddress): boolean {
    return Boolean(this.#approvals.get(workflowId)?.get(address.serverName)?.has(address.toolName));
  }

  #ensureWorkflow(workflowId: WorkflowId): Map<ServerName, Set<string>> {
    let serverMap = this.#approvals.get(workflowId);
    if (!serverMap) {
      serverMap = new Map<ServerName, Set<string>>();
      this.#approvals.set(workflowId, serverMap);
    }
    return serverMap;
  }

  #ensureServer(serverMap: Map<ServerName, Set<string>>, serverName: ServerName): Set<string> {
    let toolSet = serverMap.get(serverName);
    if (!toolSet) {
      toolSet = new Set<string>();
      serverMap.set(serverName, toolSet);
    }
    return toolSet;
  }
}
