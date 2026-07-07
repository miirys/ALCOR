import { Logger, withPrefix } from '@gitlab-org/logging';
import { isVirtualWorkspaceUri } from '@gitlab-org/fs';
import { HttpResponse, PlainTextResponse } from '@gitlab-org/duo-workflow-service';
import { WorkflowAction } from './node/clients/types';
import { WorkflowActionContext, WorkflowActionHandler } from './node/actions';
import { ActionExecutor } from './action_executor';

export class DirectActionExecutor implements ActionExecutor {
  #handlers: WorkflowActionHandler[];

  #logger: Logger;

  constructor(handlers: WorkflowActionHandler[], logger: Logger) {
    this.#handlers = handlers;
    this.#logger = withPrefix(logger, '[DirectActionExecutor]');
  }

  async execute(
    action: WorkflowAction,
    context: WorkflowActionContext,
  ): Promise<PlainTextResponse | HttpResponse> {
    const handler = this.#handlers.find((h) => h.canHandle(action));

    if (!handler) {
      const actionKeys = Object.keys(action).filter((k) => k !== 'requestID');
      this.#logger.warn(`No handler found for action: ${actionKeys.join(', ')}`);
      return { error: 'action not supported', response: '' };
    }

    if (
      handler.supportsVirtualWorkspace === false &&
      isVirtualWorkspaceUri(context.workspaceFolderUri)
    ) {
      const error = `${handler.name} is not available for virtual filesystem workspaces.`;
      this.#logger.debug(error);
      return { error, response: '' };
    }

    return handler.execute(action, context);
  }

  dispose(): void {
    // Nothing to clean up for direct execution.
  }
}
