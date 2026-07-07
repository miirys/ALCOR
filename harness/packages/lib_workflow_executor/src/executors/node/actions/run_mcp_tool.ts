import { Implements, Service, ServiceLifetime } from '@gitlab/needle';
import { Logger, withPrefix } from '@gitlab-org/logging';
import {
  MCP_TOOL_FAILURE_PREFIX,
  McpManagerWorkflowExecutorAdaptor as McpManager,
} from '@gitlab-org/ai-configuration';
import { PlainTextResponse } from '@gitlab-org/duo-workflow-service';
import { SandboxViolations, renderViolation } from '../../../violations/public';
import { WorkflowAction } from '../clients/types';
import { WorkflowActionContext, WorkflowActionHandler, WorkflowActionOf } from './index';

export type RunMcpToolAction = WorkflowActionOf<'runMCPTool'>;

@Service({
  dependencies: [Logger, McpManager, SandboxViolations],
  lifetime: ServiceLifetime.Singleton,
})
@Implements(WorkflowActionHandler)
export class RunMcpToolActionHandler implements WorkflowActionHandler<RunMcpToolAction> {
  #logger: Logger;

  #mcpManager: McpManager;

  #sandboxViolations: SandboxViolations;

  constructor(logger: Logger, mcpManager: McpManager, sandboxViolations: SandboxViolations) {
    this.#logger = withPrefix(logger, '[RunMcpToolActionHandler]');
    this.#mcpManager = mcpManager;
    this.#sandboxViolations = sandboxViolations;
  }

  name = 'run_mcp_tool';

  canHandle(action: WorkflowAction): action is RunMcpToolAction {
    return Boolean(action.runMCPTool);
  }

  async execute(
    { runMCPTool }: RunMcpToolAction,
    { abortSignal }: WorkflowActionContext,
  ): Promise<PlainTextResponse> {
    const startMs = Date.now();
    try {
      const { name, args } = runMCPTool;

      this.#logger.debug(`Running MCP tool: "${name}" with args: "${args}"`);

      abortSignal.throwIfAborted();
      const response = await this.#mcpManager.execute(name, args);

      if (response.startsWith(MCP_TOOL_FAILURE_PREFIX)) {
        const sandboxError = this.#renderViolation(startMs, response);
        if (sandboxError) return { error: sandboxError, response: '' };
      }
      return { response, error: '' };
    } catch (err) {
      const original = `${err instanceof Error ? err.message : err}`;
      const sandboxError = this.#renderViolation(startMs, original);
      return { error: sandboxError ?? original, response: '' };
    }
  }

  #renderViolation(startMs: number, errorText: string): string | undefined {
    return renderViolation(this.#sandboxViolations, startMs, errorText, this.#logger);
  }
}
