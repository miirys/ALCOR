import { gql, ClientError } from 'graphql-request';
import { Injectable, createInterfaceId } from '@gitlab/needle';
import { Logger, withPrefix } from '@gitlab-org/logging';
import { throttle, DebouncedFunc } from 'lodash-es';
import { Disposable } from '@gitlab-org/disposable';
import { ifVersionGte } from '../utils/if_version_gte';
import { GitLabApiService, GraphQLRequest, versionRequest } from '../gitlab_api';
import { EventEmitterImpl } from '../event_emitter';
import { diffEmitter } from '../utils';

import {
  InstanceFeatureFlags,
  InstanceFeatureFlagIntroduced,
  InstanceFeatureFlagRollout,
} from './constants';

const queryGetInstanceFlags = gql`
  query featureFlagsEnabled($names: [String!]!) {
    metadata {
      featureFlags(names: $names) {
        enabled
        name
      }
    }
  }
`;

// Old query for instances < 17.4
export const queryGetInstanceFlagLegacy = gql`
  query featureFlagEnabled($name: String!) {
    featureFlagEnabled(name: $name)
  }
`;

export const getInstanceFeatureFlagsRequest = (
  featureNames: InstanceFeatureFlags[],
): GraphQLRequest<InstanceFeatureFlagsResponseType> => {
  return {
    type: 'graphql',
    query: queryGetInstanceFlags,
    variables: {
      names: featureNames,
    },
  };
};

export type InstanceFeatureFlagsResponseType = {
  metadata?: {
    featureFlags: { enabled: boolean; name: string }[];
  };
};

export const InstanceFeatureFlagsService = createInterfaceId<InstanceFeatureFlagsService>(
  'InstanceFeatureFlagsService',
);

export interface InstanceFeatureFlagsService {
  /**
   * Checks if a feature flag is enabled on the GitLab instance.
   * @see `IGitLabAPI` for how the instance is determined.
   * @requires `updateInstanceFeatureFlags` to be called first.
   */
  isInstanceFlagEnabled(name: InstanceFeatureFlags): boolean;

  /**
   * Re-fetches the instance feature flags from the network.
   * This function is throttled to prevent network thrashing if called rapidly.
   */
  updateInstanceFeatureFlags(): Promise<void>;

  onChanged?(listener: (e: Map<string, boolean>) => unknown): Disposable;
}

@Injectable(InstanceFeatureFlagsService, [Logger, GitLabApiService])
export class DefaultInstanceFeatureFlagsService {
  #api: GitLabApiService;

  #logger: Logger;

  #featureFlags: Map<string, boolean> = new Map();

  #eventEmitter = diffEmitter(new EventEmitterImpl<Map<string, boolean>>());

  readonly #throttledUpdateInstanceFeatureFlags: DebouncedFunc<() => Promise<void>>;

  constructor(logger: Logger, api: GitLabApiService) {
    this.#api = api;
    this.#featureFlags = new Map();
    this.#logger = withPrefix(logger, '[CoreInstanceFeatureFlagService]');

    this.#throttledUpdateInstanceFeatureFlags = throttle(
      this.updateInstanceFeatureFlags.bind(this),
      5000,
    );
    this.#api.onApiReconfigured(async ({ isInValidState }) => {
      if (!isInValidState) return;

      await this.#updateInstanceFeatureFlags();
    });
  }

  /**
   * Fetches the feature flags from the gitlab instance
   * and updates the internal state.
   * This function is throttled to prevent network thrashing if called rapidly.
   */
  updateInstanceFeatureFlags(): Promise<void> {
    return this.#throttledUpdateInstanceFeatureFlags() ?? this.#updateInstanceFeatureFlags();
  }

  /**
   * Fetches a single feature flag using the old query (for instances < 17.4)
   */
  async #fetchSingleFeatureFlag(name: string): Promise<boolean | undefined> {
    try {
      const result = await this.#api.fetchFromApi<{ featureFlagEnabled: boolean }>({
        type: 'graphql',
        query: queryGetInstanceFlagLegacy,
        variables: { name },
      });
      this.#logger.debug(`feature flag ${name} is ${result.featureFlagEnabled}`);
      return result.featureFlagEnabled;
    } catch (e) {
      // FIXME: we need to properly handle graphql errors
      // https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/-/issues/250
      if (e instanceof ClientError) {
        const fieldDoesntExistError = e.message.match(/field '([^']+)' doesn't exist on type/i);
        if (fieldDoesntExistError) {
          // we expect graphql-request to throw an error when the query doesn't exist (eg. GitLab 16.9)
          // so we debug to reduce noise
          this.#logger.debug(`query doesn't exist`, e.message);
        } else {
          this.#logger.error(`error fetching feature flag ${name}`, e);
        }
      }
      // Return undefined to indicate the flag doesn't exist or couldn't be fetched
      return undefined;
    }
  }

  /**
   * Apply default logic for feature flags based on the instance version
   */
  #applyFeatureFlagDefaults(
    flags: InstanceFeatureFlags[],
    fetchedFlags: Record<string, boolean | undefined>,
    version: string,
  ): Record<string, boolean> {
    return Object.fromEntries(
      flags.map((flag) => {
        // If we got a definitive result from the API, use it
        if (fetchedFlags[flag] !== undefined) {
          return [flag, fetchedFlags[flag]];
        }

        // Otherwise the feature flag either:
        // 1. Is not defined for this instance yet.
        // 2. Was removed from the codebase (after being enabled by default for a period).
        return ifVersionGte(
          version,
          InstanceFeatureFlagIntroduced[flag],
          () => {
            const defaultEnabled = InstanceFeatureFlagRollout[flag];
            return [
              flag,
              defaultEnabled
                ? ifVersionGte(
                    version,
                    defaultEnabled,
                    () => true,
                    () => false,
                  )
                : false,
            ];
          },
          () => [flag, false],
        );
      }),
    );
  }

  /**
   * Fetch feature flags using the batch query (17.4+)
   */
  async #fetchInstanceFeatureFlagsCurrent(
    flags: InstanceFeatureFlags[],
  ): Promise<Record<string, boolean | undefined>> {
    const response = await this.#api.fetchFromApi(getInstanceFeatureFlagsRequest(flags));

    if (!response.metadata) {
      return {};
    }

    const result: Record<string, boolean | undefined> = {};
    for (const flag of flags) {
      // this eslint violation predates the introduction of enum eslint rules

      const instanceFlag = response.metadata.featureFlags.find(({ name }) => name === flag);
      if (instanceFlag?.enabled !== undefined) {
        result[flag] = instanceFlag.enabled;
      }
    }
    return result;
  }

  /**
   * Fallback method for fetching feature flags on instances < 17.4
   */
  async #fetchInstanceFeatureFlagsLegacy(
    flags: InstanceFeatureFlags[],
  ): Promise<Record<string, boolean | undefined>> {
    const result: Record<string, boolean | undefined> = {};

    for (const flag of flags) {
      // eslint-disable-next-line no-await-in-loop
      const enabled = await this.#fetchSingleFeatureFlag(flag);
      if (enabled !== undefined) {
        result[flag] = enabled;
      }
    }

    return result;
  }

  async #fetchInstanceFeatureFlags(
    flags: InstanceFeatureFlags[],
  ): Promise<Record<string, boolean>> {
    try {
      const { version } = await this.#api.fetchFromApi(versionRequest);

      const fetchedFlags = await ifVersionGte(
        version,
        '17.4.0',
        () => this.#fetchInstanceFeatureFlagsCurrent(flags),
        () => this.#fetchInstanceFeatureFlagsLegacy(flags),
      );

      return this.#applyFeatureFlagDefaults(flags, fetchedFlags, version);
    } catch (e) {
      this.#logger.error(e);
      return {};
    }
  }

  async #updateInstanceFeatureFlags(): Promise<void> {
    this.#logger.debug('Populating feature flags');
    const flags = await this.#fetchInstanceFeatureFlags(Object.values(InstanceFeatureFlags));

    for (const [flag, enabled] of Object.entries(flags)) {
      this.#logger.debug(`Instance feature flag "${flag}" is ${enabled ? 'enabled' : 'disabled'}`);
      this.#featureFlags.set(flag, enabled);
    }

    this.#eventEmitter.fire(new Map(this.#featureFlags));
  }

  /**
   * Checks if a feature flag is enabled on the GitLab instance.
   * @see `GitLabApiClient` for how the instance is determined.
   * @requires `updateInstanceFeatureFlags` to be called first.
   */
  isInstanceFlagEnabled(name: InstanceFeatureFlags): boolean {
    return this.#featureFlags.get(name) ?? false;
  }

  onChanged = (listener: (e: Map<string, boolean>) => unknown): Disposable => {
    const disposable = this.#eventEmitter.event(listener);

    listener(new Map(this.#featureFlags));

    return disposable;
  };
}
