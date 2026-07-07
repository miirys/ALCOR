import { gql } from 'graphql-request';
import { Disposable } from '@gitlab-org/disposable';
import { createInterfaceId, Injectable } from '@gitlab/needle';
import {
  ApiRequest,
  FeatureStateCheck,
  StateCheckId,
  SUGGESTIONS_NO_LICENSE,
} from '@gitlab-org/core';
import { ConfigService, ClientConfig } from '@gitlab-org/config';
import {
  StateCheck,
  StateCheckChangedEventData,
  StateConfigCheck,
} from '@gitlab-org/feature-state';
import { GitLabApiClient } from '../api';
import { ApiStateCheck } from './api_state_check';

export type CodeSuggestionsDuoLicenseCheck = StateCheck<typeof SUGGESTIONS_NO_LICENSE> &
  StateConfigCheck;

export const CodeSuggestionsDuoLicenseCheck = createInterfaceId<CodeSuggestionsDuoLicenseCheck>(
  'CodeSuggestionsDuoLicenseCheck',
);

export interface GqlDuoCodeSuggestionsAvailable {
  currentUser: {
    duoCodeSuggestionsAvailable: boolean;
  };
}

const query = {
  type: 'graphql',
  query: gql`
    query suggestionsAvailable {
      currentUser {
        duoCodeSuggestionsAvailable
      }
    }
  `,
  variables: {},
} satisfies ApiRequest<GqlDuoCodeSuggestionsAvailable>;

@Injectable(CodeSuggestionsDuoLicenseCheck, [GitLabApiClient, ConfigService])
export class DefaultCodeSuggestionsDuoLicenseCheck implements CodeSuggestionsDuoLicenseCheck {
  #apiStateCheck: ApiStateCheck<GqlDuoCodeSuggestionsAvailable>;

  constructor(api: GitLabApiClient) {
    this.#apiStateCheck = new ApiStateCheck(
      api,
      this.id,
      'A GitLab Duo license is required to use this feature. Contact your GitLab administrator to request access.',
      query,
      (response) => response.currentUser.duoCodeSuggestionsAvailable,
    );
  }

  onChanged(listener: (data: StateCheckChangedEventData) => void): Disposable {
    return this.#apiStateCheck.onChanged(listener);
  }

  get engaged() {
    return this.#apiStateCheck.engaged;
  }

  id = SUGGESTIONS_NO_LICENSE;

  get details() {
    return this.#apiStateCheck.details;
  }

  dispose() {
    this.#apiStateCheck.dispose();
  }

  async validate(config: ClientConfig): Promise<FeatureStateCheck<StateCheckId>> {
    const isValid = await this.#apiStateCheck.validate(config);

    if (!isValid) {
      return {
        checkId: this.id,
        details: this.details,
        engaged: true,
      };
    }

    return {
      checkId: this.id,
      details: this.details,
      engaged: false,
    };
  }
}
