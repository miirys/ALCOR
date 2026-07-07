import { Logger, withPrefix } from '@gitlab-org/logging';
import { HttpResponse, PlainTextResponse } from '@gitlab-org/duo-workflow-service';
import { ActionExecutor } from '@gitlab-org/workflow-executor';
import { type WorkflowAction, WorkflowActionContext } from '@gitlab-org/workflow-executor/node';
import { DefaultRpcMessageSender, RpcMessageSender } from '@gitlab-org/rpc-client';
import { RpcMessageDefinitionProvider } from '@gitlab-org/rpc';
import { type SandboxViolations, renderViolation } from '@gitlab-org/workflow-executor/violations';
import { WorkerProcessManager } from './worker_process_manager';
import { ExecuteActionRequest, CancelActionNotification, type WorkerContext } from './worker_rpc';

const workerMessageDefinitions: RpcMessageDefinitionProvider = {
  getMessageDefinitions: () => [ExecuteActionRequest, CancelActionNotification],
};

export class SandboxedActionExecutor implements ActionExecutor {
  #workerManager: WorkerProcessManager;

  #sandboxViolations: SandboxViolations;

  #logger: Logger;

  constructor(
    workerManager: WorkerProcessManager,
    sandboxViolations: SandboxViolations,
    logger: Logger,
  ) {
    this.#workerManager = workerManager;
    this.#sandboxViolations = sandboxViolations;
    this.#logger = withPrefix(logger, '[SandboxedActionExecutor]');
  }

  async execute(
    action: WorkflowAction,
    context: WorkflowActionContext,
  ): Promise<PlainTextResponse | HttpResponse> {
    try {
      const connection = await this.#workerManager.ensureRunning(context.workspaceFolderPath);

      const sender: RpcMessageSender = new DefaultRpcMessageSender(
        connection,
        workerMessageDefinitions,
      );

      const workerContext: WorkerContext = {
        workspaceFolderPath: context.workspaceFolderPath,
        workspaceFolderUri: context.workspaceFolderUri,
        workflowId: context.workflowId,
        gitlabBaseUrl: context.workflowToken.gitlab_rails.base_url,
        gitlabToken: context.workflowToken.gitlab_rails.token,
      };

      const abortHandler = () => {
        sender.send(CancelActionNotification, { requestID: action.requestID }).catch((err) => {
          this.#logger.debug('Failed to send cancel notification', err);
        });
      };
      context.abortSignal.addEventListener('abort', abortHandler);

      try {
        // Snapshot just before the sandboxed call so worker startup doesn't widen the window.
        const startMs = Date.now();
        const response = await sender.send(ExecuteActionRequest, {
          action: action as unknown as Record<string, unknown>,
          context: workerContext,
        });
        if (response.error) {
          const sandboxError = renderViolation(
            this.#sandboxViolations,
            startMs,
            response.error,
            this.#logger,
            this.#workerManager.getSandboxedCommand() ?? undefined,
          );
          if (sandboxError) {
            return { ...response, error: sandboxError };
          }
        }
        return response;
      } finally {
        context.abortSignal.removeEventListener('abort', abortHandler);
      }
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      this.#logger.error(`Action execution failed: ${error}`);
      return { response: '', error };
    }
  }

  dispose(): void {
    this.#workerManager.shutdown();
  }
}
