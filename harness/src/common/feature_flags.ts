import { Injectable } from '@gitlab/needle';
import {
  InstanceFeatureFlags,
  InstanceFeatureFlagsService,
  FeatureFlagService,
  ClientFeatureFlags,
} from '@gitlab-org/core';
import { ConfigService } from '@gitlab-org/config';

@Injectable(FeatureFlagService, [ConfigService, InstanceFeatureFlagsService])
export class DefaultFeatureFlagService {
  #configService: ConfigService;

  #instanceFeatureFlagsService: InstanceFeatureFlagsService;

  constructor(
    configService: ConfigService,
    instanceFeatureFlagsService: InstanceFeatureFlagsService,
  ) {
    this.#configService = configService;
    this.#instanceFeatureFlagsService = instanceFeatureFlagsService;
  }

  /**
   * Fetches the feature flags from the gitlab instance
   * @see `InstanceFeatureFlagsService` for implementation details
   */
  updateInstanceFeatureFlags(): Promise<void> {
    return this.#instanceFeatureFlagsService.updateInstanceFeatureFlags();
  }

  /**
   * Checks if a feature flag is enabled on the GitLab instance.
   * @see `InstanceFeatureFlagsService` for implementation details
   */
  isInstanceFlagEnabled(name: InstanceFeatureFlags): boolean {
    if (this.#configService.get('featureFlagOverrides')?.[name]) return true;
    return this.#instanceFeatureFlagsService.isInstanceFlagEnabled(name);
  }

  /**
   * Checks if a feature flag is enabled on the client.
   * @see `ConfigService` for client configuration.
   */
  isClientFlagEnabled(name: ClientFeatureFlags): boolean {
    if (this.#configService.get('featureFlagOverrides')?.[name]) return true;
    const value = this.#configService.get('featureFlags')?.[name];
    return value ?? false;
  }
}
