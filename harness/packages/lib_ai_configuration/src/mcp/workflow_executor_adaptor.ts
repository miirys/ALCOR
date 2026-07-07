import { Logger } from '@gitlab-org/logging';
import { Service, ServiceLifetime } from '@gitlab/needle';
import type { McpTool, WorkflowId } from './types';
import { McpManager } from './manager';

export const MCP_TOOL_FAILURE_PREFIX = 'The tool cannot be executed:';

@Service({
  dependencies: [Logger, McpManager],
  lifetime: ServiceLifetime.Singleton,
})
export class McpManagerWorkflowExecutorAdaptor {
  #logger: Logger;

  #managerService: McpManager;

  constructor(logger: Logger, managerService: McpManager) {
    this.#logger = logger;
    this.#managerService = managerService;
  }

  async reload(workspacePath: string, workflowId?: string): Promise<McpTool[]> {
    const reloadStart = Date.now();
    try {
      await this.#managerService.reloadAllServers(workspacePath);
      await this.#managerService.waitForAllServersSettled(30000);

      const tools = await this.#managerService.getTools(workflowId as WorkflowId);

      this.#logger.info(
        `[MCP] Reload complete - tools=${tools.length} duration_ms=${Date.now() - reloadStart}`,
      );

      return tools;
    } catch (e) {
      this.#logger.warn(`[MCP] Error during reload: ${e}`);
      return [];
    }
  }

  preWarm(workspacePath: string): void {
    this.#logger.debug(`[MCP] Pre-warming servers for workspace: ${workspacePath}`);
    this.#managerService.reloadAllServers(workspacePath).catch((e) => {
      this.#logger.warn(`[MCP] Pre-warm failed: ${e}`);
    });
  }

  async execute(name: string, args: string): Promise<string> {
    try {
      const parsedArgs = JSON.parse(args);
      return await this.#managerService.executeTool(name, parsedArgs);
    } catch (e) {
      this.#logger.error(`[MCP] Tool execution failed - tool="${name}" error="${e}"`, e);
      return `${MCP_TOOL_FAILURE_PREFIX} ${e}`;
    }
  }
}
