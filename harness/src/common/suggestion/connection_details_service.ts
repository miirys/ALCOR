import { Injectable, createInterfaceId } from '@gitlab/needle';
import { GitLabApiService, isNot4xxFailure } from '@gitlab-org/core';
import { AbortError, isNotAbort, retry } from '@gitlab-org/resiliency';
import { Logger, withPrefix } from '@gitlab-org/logging';
import { InvalidInstanceVersionError } from '@gitlab-org/fetch';
import { GitlabRealm } from '../utils/realm_detection';

export interface IConnectionDetails {
  instance_id: string | null;
  instance_version: string | null;
  global_user_id: string | null;
  host_name: string | null;
  saas_duo_pro_namespace_ids: number[];
  feature_enablement_type: string | null;
  realm: GitlabRealm;
}

export interface ConnectionDetailsService {
  details: IConnectionDetails | undefined;
  fetch(): Promise<void>;
}

export const ConnectionDetailsService = createInterfaceId<ConnectionDetailsService>(
  'ConnectionDetailsService',
);

@Injectable(ConnectionDetailsService, [GitLabApiService, Logger])
export class DefaultConnectionDetailsService implements ConnectionDetailsService {
  #api: GitLabApiService;

  #logger: Logger;

  #details: IConnectionDetails | undefined;

  constructor(api: GitLabApiService, logger: Logger) {
    this.#api = api;
    this.#logger = withPrefix(logger, '[ConnectionDetailsService]');
    this.#api.onApiReconfigured(() => this.#reset());
  }

  get details(): IConnectionDetails | undefined {
    return this.#details;
  }

  async fetch(): Promise<void> {
    if (this.#details) {
      return;
    }

    let details;

    try {
      details = await retry(
        this.#api.fetchOperation<IConnectionDetails>({
          type: 'rest',
          method: 'POST',
          path: '/api/v4/code_suggestions/connection_details',
          supportedSinceInstanceVersion: {
            version: '18.3.0-pre',
            resourceName: 'Get connection details',
          },
        }),
        {
          shouldRetry: [isNotAbort, isNot4xxFailure],
          onRetry: (retryCount, error) => {
            this.#logger.warn(
              `Failed to fetch access information. Retrying (attempt number ${retryCount})`,
              error,
            );
          },
        },
      );

      this.#details = details;
    } catch (error) {
      if (error instanceof AbortError) {
        return;
      }

      if (error instanceof InvalidInstanceVersionError) {
        this.#logger.info('GitLab instance does not support fetching connection details.');
        return;
      }

      this.#logger.error(`Failed to fetch access connection details.`, error);
    }
  }

  #reset(): void {
    this.#details = undefined;
  }
}
