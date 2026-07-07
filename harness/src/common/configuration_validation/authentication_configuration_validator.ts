import { createInterfaceId, Injectable } from '@gitlab/needle';
import {
  AUTHENTICATION,
  AUTHENTICATION_REQUIRED,
  FeatureState,
  FeatureStateCheck,
  INVALID_TOKEN,
  StateCheckId,
} from '@gitlab-org/core';
import { ClientConfig } from '@gitlab-org/config';
import { GitLabApiClient } from '../api';
import { ConfigurationValidator } from './configuration_validator';

export type AuthenticationConfigurationValidator = ConfigurationValidator;

export const AuthenticationConfigurationValidator =
  createInterfaceId<AuthenticationConfigurationValidator>('AuthenticationConfigurationValidator');

@Injectable(AuthenticationConfigurationValidator, [GitLabApiClient])
export class DefaultAuthenticationConfigurationValidator
  implements AuthenticationConfigurationValidator
{
  #api: GitLabApiClient;

  #allChecks: FeatureStateCheck<StateCheckId>[] = [
    {
      checkId: AUTHENTICATION_REQUIRED,
      details: 'You need to authenticate to use GitLab Duo.',
      engaged: false,
    },
    {
      checkId: INVALID_TOKEN,
      details: 'The provided token is invalid or expired.',
      engaged: false,
    },
  ];

  constructor(api: GitLabApiClient) {
    this.#api = api;
  }

  feature = AUTHENTICATION;

  async validate(config: ClientConfig): Promise<FeatureState> {
    const allChecks = await this.#updateAuthChecks(config);

    // return a filtered version of allChecks where engaged is true
    const engagedCheck = allChecks.find((check) => check.engaged);

    if (engagedCheck) {
      return {
        featureId: AUTHENTICATION,
        engagedChecks: [engagedCheck],
        allChecks: this.#allChecks,
      };
    }

    return { featureId: AUTHENTICATION, engagedChecks: [], allChecks: this.#allChecks };
  }

  async #updateAuthChecks(config: ClientConfig): Promise<FeatureStateCheck<StateCheckId>[]> {
    const { baseUrl, token } = config;

    // Reset all checks to not engaged
    for (const check of this.#allChecks) check.engaged = false;

    if (!token || !baseUrl) {
      this.#allChecks[0].engaged = true;
      return this.#allChecks;
    }

    const result = await this.#api.checkToken(baseUrl, token);

    if (!result.valid) {
      this.#allChecks[1].engaged = true;
      return this.#allChecks;
    }

    return this.#allChecks;
  }
}
