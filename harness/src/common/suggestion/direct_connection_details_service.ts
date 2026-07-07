import { Injectable, createInterfaceId } from '@gitlab/needle';
import { GitLabApiService, isNot4xxFailure } from '@gitlab-org/core';
import { Logger, withPrefix } from '@gitlab-org/logging';
import { AbortError, isNotAbort, retry } from '@gitlab-org/resiliency';
import { ConfigService } from '@gitlab-org/config';
import { InvalidInstanceVersionError } from '@gitlab-org/fetch';
import { SECOND } from '../constants';

export interface IDirectConnectionDetailsHeaders {
  'X-Gitlab-Global-User-Id': string;
  'X-Gitlab-Instance-Id': string;
  'X-Gitlab-Host-Name': string;
  'X-Gitlab-Saas-Duo-Pro-Namespace-Ids': string;
  'X-Gitlab-Feature-Enablement-Type'?: string;
}

export interface IDirectConnectionModelDetails {
  model_provider: string;
  model_name: string;
}

export interface IDirectConnectionDetails {
  base_url: string;
  token: string;
  expires_at: number;
  headers: IDirectConnectionDetailsHeaders;
  model_details: IDirectConnectionModelDetails;
}

export interface DirectConnectionDetailsService {
  details: IDirectConnectionDetails | undefined;
  refresh(signal: AbortSignal): Promise<void>;
  refreshIfNeeded(signal: AbortSignal): Promise<void>;
  expired(): boolean;
}

export const DirectConnectionDetailsService = createInterfaceId<DirectConnectionDetailsService>(
  'DirectConnectionDetailsService',
);

const SMALL_GRACE_DURATION_JUST_TO_BE_SURE = 40 * SECOND;

@Injectable(DirectConnectionDetailsService, [GitLabApiService, ConfigService, Logger])
export class DefaultDirectConnectionDetailsService implements DirectConnectionDetailsService {
  #api: GitLabApiService;

  #configService: ConfigService;

  #logger: Logger;

  #details: IDirectConnectionDetails | undefined;

  constructor(api: GitLabApiService, configService: ConfigService, logger: Logger) {
    this.#api = api;
    this.#configService = configService;
    this.#logger = withPrefix(logger, '[DirectConnectionDetailsService]');
    this.#api.onApiReconfigured(() => this.#reset());
  }

  get details(): IDirectConnectionDetails | undefined {
    return this.#details;
  }

  expired(): boolean {
    if (!this.#details) {
      return true;
    }

    return Date.now() > this.#details.expires_at * SECOND - SMALL_GRACE_DURATION_JUST_TO_BE_SURE;
  }

  async refresh(signal: AbortSignal): Promise<void> {
    if (signal.aborted) {
      return;
    }

    const projectPath = this.#configService.get('projectPath');

    let details;

    try {
      details = await retry(
        this.#api.fetchOperation<IDirectConnectionDetails>({
          type: 'rest',
          method: 'POST',
          path: '/api/v4/code_suggestions/direct_access',
          body: { project_path: projectPath ?? '' },
          supportedSinceInstanceVersion: {
            version: '17.2.0',
            resourceName: 'get direct connection details',
          },
        }),
        {
          signal,
          shouldRetry: [isNotAbort, isNot4xxFailure],
          onRetry: (retryCount, error) => {
            this.#logger.warn(
              `Failed to fetch direct access information. Retrying (attempt number ${retryCount})`,
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
        this.#logger.info('GitLab instance does not support fetching direct connection details.');
        return;
      }

      this.#logger.error(`Failed to fetch direct access connection details.`, error);
    }
  }

  async refreshIfNeeded(signal: AbortSignal): Promise<void> {
    if (this.expired()) {
      await this.refresh(signal);
    }
  }

  #reset(): void {
    this.#details = undefined;
  }
}
