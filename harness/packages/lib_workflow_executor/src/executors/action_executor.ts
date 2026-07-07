import { createInterfaceId } from '@gitlab/needle';
import { HttpResponse, PlainTextResponse } from '@gitlab-org/duo-workflow-service';
import { WorkflowAction } from './node/clients/types';
import { WorkflowActionContext } from './node/actions';

export interface ActionExecutor {
  execute(
    action: WorkflowAction,
    context: WorkflowActionContext,
  ): Promise<PlainTextResponse | HttpResponse>;

  dispose(): void;
}

export const ActionExecutor = createInterfaceId<ActionExecutor>('ActionExecutor');
