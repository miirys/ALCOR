import { WorkflowRunner, UsageQuotaService } from '@gitlab-lsp/workflow-api';

import { Logger } from '@gitlab-org/logging';
import { ControllerData, ControllerResponse, WorkflowGraphqlPayloadClient } from './types';
import { NO_REPLY } from './constants';

type LogLevel = 'log' | 'warn' | 'error';

export const initWorkflowCommonController = (
  workflowApi: WorkflowRunner,
  log: Logger,
  usageQuotaService: UsageQuotaService,
) => {
  return {
    async checkUsageQuota({
      rootNamespaceId,
      workflowDefinition,
      projectId,
    }: {
      rootNamespaceId?: string;
      workflowDefinition?: string;
      projectId?: string;
    } = {}): Promise<ControllerResponse> {
      const abortController = new AbortController();
      const quotaExceeded = await usageQuotaService.checkUsageCreditsExceeded(
        abortController.signal,
        rootNamespaceId,
        workflowDefinition,
        projectId,
      );

      return {
        eventName: 'setUsageQuotaExceeded',
        data: {
          exceeded: quotaExceeded,
        },
      };
    },

    logToOutputChannel({ message, level }: { message: string; level: LogLevel }) {
      const messageWithPrefix = `[Duo Workflow Plugin] ${message}`;
      switch (level) {
        case 'log':
          log.info(messageWithPrefix);
          break;
        case 'warn':
          log.warn(messageWithPrefix);
          break;
        case 'error':
          log.error(messageWithPrefix);
          break;
        default:
          log.info(messageWithPrefix);
          break;
      }

      return NO_REPLY;
    },

    async getGraphqlData({
      eventName,
      query,
      variables,
      supportedSinceInstanceVersion,
      fragment,
      operationName,
    }: WorkflowGraphqlPayloadClient): Promise<ControllerResponse> {
      try {
        const response = await workflowApi.getGraphqlData({
          query,
          fragment,
          variables,
          supportedSinceInstanceVersion,
          operationName,
        });

        return {
          eventName,
          data: response,
        };
      } catch (e) {
        const error = e as Error;

        log.error(`Failed to get graphql data for query ${query}`, error);

        return {
          eventName: 'workflowError',
          data: error.message,
        };
      }
    },

    async getProjectPath(): Promise<ControllerResponse> {
      return {
        eventName: 'setProjectPath',
        data: workflowApi.getProjectPath(),
      };
    },

    async getNamespacePath(): Promise<ControllerResponse> {
      return {
        eventName: 'setNamespacePath',
        data: workflowApi.getNamespacePath(),
      };
    },

    /**
     * @deprecated docker executor has been removed
     */
    async pullDockerImage(): Promise<ControllerResponse> {
      return {
        eventName: 'pullDockerImageCompleted',
        data: {
          success: true,
        },
      };
    },
    /**
     * @deprecated docker executor has been removed
     */
    async verifyDockerImage(): Promise<ControllerData> {
      return [
        { eventName: 'dockerConfigured', data: true },
        {
          eventName: 'isDockerImageAvailable',
          data: true,
        },
      ];
    },
  };
};
