import {
  DUO_NAMESPACE_NOT_ENTITLED_MESSAGE,
  GitLabApiService,
  classifyDuoAccessError,
  isFetchError,
  type ApiRequest,
} from '@gitlab-org/core';
import { Logger, withPrefix } from '@gitlab-org/logging';
import { Service, ServiceLifetime } from '@gitlab/needle';

export type BetaFeaturesCheckResult = { status: 'enabled' } | { status: 'error'; message: string };

interface GroupResponse {
  experiment_features_enabled?: boolean;
}

@Service({
  dependencies: [GitLabApiService, Logger],
  lifetime: ServiceLifetime.Singleton,
})
export class BetaFeaturesCheckService {
  #apiService: GitLabApiService;

  #logger: Logger;

  constructor(apiService: GitLabApiService, logger: Logger) {
    this.#apiService = apiService;
    this.#logger = withPrefix(logger, '[BetaFeaturesCheckService]');
  }

  /**
   * Checks whether beta/experimental features are enabled for the given root namespace.
   *
   * Returns `{ status: 'enabled' }` when the setting is confirmed on,
   * or `{ status: 'error', message }` with a user-facing explanation otherwise.
   */
  async check(rootNamespace: string): Promise<BetaFeaturesCheckResult> {
    const encodedNamespace = encodeURIComponent(rootNamespace);

    this.#logger.debug(`Checking beta features for namespace: ${rootNamespace}`);

    let response: GroupResponse;
    try {
      const request: ApiRequest<GroupResponse> = {
        type: 'rest',
        method: 'GET',
        path: `/api/v4/groups/${encodedNamespace}?with_projects=false`,
      };
      response = await this.#apiService.fetchFromApi(request);
    } catch (error) {
      this.#logger.error('Failed to fetch group details', error);

      if (isFetchError(error)) {
        const duoError = classifyDuoAccessError(error.status, error.body);
        if (duoError) {
          return { status: 'error', message: duoError.message };
        }
        // The groups API returns 404 (not 403) when the caller can't access the group, so for this
        // preflight a 404 also indicates a Duo access problem.
        if (error.status === 404) {
          return { status: 'error', message: DUO_NAMESPACE_NOT_ENTITLED_MESSAGE };
        }
      }

      return {
        status: 'error',
        message:
          `Failed to verify access to experimental and beta GitLab Duo features for group "${rootNamespace}". ` +
          'Ensure you have access to this group and that your GitLab instance is reachable.',
      };
    }

    if (response.experiment_features_enabled === undefined) {
      this.#logger.debug(
        `Instance does not support beta features API for namespace: ${rootNamespace}`,
      );
      return {
        status: 'error',
        message:
          `Failed to verify access to experimental and beta GitLab Duo features for group "${rootNamespace}". ` +
          'Please ensure your GitLab instance is version 18.11 or later.',
      };
    }

    if (response.experiment_features_enabled === false) {
      this.#logger.debug(`Beta features disabled for namespace: ${rootNamespace}`);
      return {
        status: 'error',
        message:
          'Experimental and beta GitLab Duo features are not turned on for your group. ' +
          'To use the ALCOR, ask your group Owner to turn them on under Settings > GitLab Duo.',
      };
    }

    this.#logger.debug(`Beta features enabled for namespace: ${rootNamespace}`);
    return { status: 'enabled' };
  }
}
