import { Injectable } from '@gitlab/needle';
import { GitLabApiService, isFetchError, isNot4xxFailure } from '@gitlab-org/core';
import { Logger, withPrefix } from '@gitlab-org/logging';
import { AbortError, isNotAbort, retry } from '@gitlab-org/resiliency';
import { InvalidInstanceVersionError } from '@gitlab-org/fetch';
import { UsageQuotaService } from './usage_quota_service';

export function isUsageQuotaExceededError(error: unknown): boolean {
  if (isFetchError(error) && error.body) {
    return error.body.includes('USAGE_QUOTA_EXCEEDED');
  }

  return false;
}

@Injectable(UsageQuotaService, [GitLabApiService, Logger])
export class DefaultUsageQuotaService implements UsageQuotaService {
  #api: GitLabApiService;

  #logger: Logger;

  #usageQuotaExceeded = false;

  constructor(api: GitLabApiService, logger: Logger) {
    this.#api = api;
    this.#logger = withPrefix(logger, '[UsageQuotaService]');
    this.#api.onApiReconfigured(() => this.#reset());
  }

  get usageQuotaExceeded(): boolean {
    return this.#usageQuotaExceeded;
  }

  async checkUsageCreditsExceeded(
    signal: AbortSignal,
    rootNamespaceId?: string,
    workflowDefinition?: string,
    projectId?: string,
  ): Promise<boolean> {
    if (signal.aborted) {
      return this.#usageQuotaExceeded;
    }

    this.#logger.info(
      `Running credits check with rootNamespaceId: ${rootNamespaceId ?? 'undefined'}, workflowDefinition: ${workflowDefinition ?? 'undefined'}, projectId: ${projectId ?? 'undefined'}`,
    );

    try {
      const body: {
        root_namespace_id?: string;
        workflow_definition?: string;
        project_id?: string;
      } = {};

      if (rootNamespaceId) {
        body.root_namespace_id = rootNamespaceId;
      }

      if (workflowDefinition) {
        body.workflow_definition = workflowDefinition;
      }

      if (projectId) {
        body.project_id = projectId;
      }

      this.#logger.debug(`Request body: ${JSON.stringify(body)}`);

      await retry(
        this.#api.fetchOperation({
          type: 'rest',
          method: 'POST',
          path: '/api/v4/ai/duo_workflows/direct_access',
          body,
          supportedSinceInstanceVersion: {
            resourceName: 'get workflow direct access',
            version: '18.1.0',
          },
        }),
        {
          signal,
          shouldRetry: [isNotAbort, isNot4xxFailure, (error) => !isUsageQuotaExceededError(error)],
          onRetry: (retryCount, error) => {
            this.#logger.warn(
              `Failed to check usage quota. Retrying (attempt number ${retryCount})`,
              error,
            );
          },
        },
      );

      this.#usageQuotaExceeded = false;
      return false;
    } catch (error) {
      if (error instanceof AbortError) {
        return this.#usageQuotaExceeded;
      }

      if (error instanceof InvalidInstanceVersionError) {
        this.#logger.error('GitLab instance does not support usage quota checking.');
        return this.#usageQuotaExceeded;
      }

      if (isUsageQuotaExceededError(error)) {
        this.#logger.warn('Usage quota exceeded for duo workflows');
        this.#usageQuotaExceeded = true;
        return true;
      }

      this.#logger.error('Failed to check usage quota', error);
      this.#usageQuotaExceeded = false;
      return false;
    }
  }

  #reset(): void {
    this.#usageQuotaExceeded = false;
  }
}
