import { Connection } from 'vscode-languageserver';
import { WorkflowRunner, RunWorkflowPayload } from '@gitlab-lsp/workflow-api';
import { createInterfaceId, Injectable } from '@gitlab/needle';
import { ClientFeatureFlags, FeatureFlagService, LsConnection } from '@gitlab-org/core';
import { log } from './log';
import { SendWorkflowEventNotificationParams } from './notifications';

export const WORKFLOW_MESSAGE_NOTIFICATION = '$/gitlab/workflowMessage';

// FIXME: Move this whole file into the workflow package
export interface WorkflowHandler {
  startWorkflowNotificationHandler: (p: RunWorkflowPayload) => void;
  sendWorkflowEventHandler: (p: SendWorkflowEventNotificationParams) => void;
}

export const WorkflowHandler = createInterfaceId<WorkflowHandler>('WorkflowHandler');

@Injectable(WorkflowHandler, [LsConnection, FeatureFlagService, WorkflowRunner])
export class DefaultWorkflowHandler implements WorkflowHandler {
  #connection: Connection;

  #featureFlagService: FeatureFlagService;

  #workflowAPI: WorkflowRunner | undefined;

  constructor(
    connection: LsConnection,
    featureFlagService: FeatureFlagService,
    workflowAPI: WorkflowRunner,
  ) {
    this.#connection = connection;
    this.#featureFlagService = featureFlagService;
    this.#workflowAPI = workflowAPI;
  }

  async #sendWorkflowErrorNotification(message: string) {
    // FIXME: This is antipattern, don't access connection outside of the ConnectionService
    // the best way to handle this is to accept notification function here and use that
    // see https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/blob/f1b1b578a3af26d14a4b1e6b0c0113b3671aa075/src/common/connection_service.ts#L119 for how to implement this
    await this.#connection.sendNotification(WORKFLOW_MESSAGE_NOTIFICATION, {
      message,
      type: 'error',
    });
  }

  startWorkflowNotificationHandler = async ({ goal, metadata }: RunWorkflowPayload) => {
    const duoWorkflow = this.#featureFlagService.isClientFlagEnabled(
      ClientFeatureFlags.DuoWorkflow,
    );
    if (!duoWorkflow) {
      await this.#sendWorkflowErrorNotification(
        `The GitLab Duo Agent Platform feature is not enabled`,
      );
      return;
    }

    if (!this.#workflowAPI) {
      await this.#sendWorkflowErrorNotification('Workflow API is not configured for the LSP');
      return;
    }

    try {
      await this.#workflowAPI?.runWorkflow({ goal, metadata, additionalContext: [] });
    } catch (e) {
      log.error('Error in running workflow', e);
      await this.#sendWorkflowErrorNotification(`Error occurred while running workflow ${e}`);
    }
  };

  sendWorkflowEventHandler = async ({
    workflowID,
    eventType,
    message,
  }: SendWorkflowEventNotificationParams) => {
    const duoWorkflow = this.#featureFlagService.isClientFlagEnabled(
      ClientFeatureFlags.DuoWorkflow,
    );
    if (!duoWorkflow) {
      await this.#sendWorkflowErrorNotification(
        `The GitLab Duo Agent Platform feature is not enabled`,
      );
      return;
    }

    try {
      await this.#workflowAPI?.sendEvent(workflowID, eventType, message);
    } catch (e) {
      log.error('Error in running workflow', e);
      await this.#sendWorkflowErrorNotification(`Error occurred while sending event ${e}`);
    }
  };
}
