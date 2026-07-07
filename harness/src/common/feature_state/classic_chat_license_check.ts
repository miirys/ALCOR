import { gql } from 'graphql-request';
import { Disposable } from '@gitlab-org/disposable';
import { createInterfaceId, Injectable } from '@gitlab/needle';
import {
  ApiRequest,
  CLASSIC_CHAT_NO_LICENSE,
  FeatureStateCheck,
  StateCheckId,
} from '@gitlab-org/core';
import { ClientConfig } from '@gitlab-org/config';
import {
  StateCheck,
  StateCheckChangedEventData,
  StateConfigCheck,
} from '@gitlab-org/feature-state';
import { GitLabApiClient } from '../api';
import { ApiStateCheck } from './api_state_check';

export type ClassicChatLicenseCheck = StateCheck<typeof CLASSIC_CHAT_NO_LICENSE> & StateConfigCheck;

export const ClassicChatLicenseCheck =
  createInterfaceId<ClassicChatLicenseCheck>('ClassicChatLicenseCheck');

export interface GqlClassicChatAvailable {
  currentUser: {
    duoClassicChatAvailable: boolean;
  };
}

const query = {
  type: 'graphql',
  query: gql`
    query classicChatAvailable {
      currentUser {
        duoClassicChatAvailable
      }
    }
  `,
  variables: {},
  supportedSinceInstanceVersion: {
    version: '18.10.0',
    resourceName: 'get current user Duo Classic Chat license',
  },
} satisfies ApiRequest<GqlClassicChatAvailable>;

@Injectable(ClassicChatLicenseCheck, [GitLabApiClient])
export class DefaultClassicChatLicenseCheck implements ClassicChatLicenseCheck {
  #apiStateCheck: ApiStateCheck<GqlClassicChatAvailable>;

  constructor(api: GitLabApiClient) {
    this.#apiStateCheck = new ApiStateCheck(
      api,
      this.id,
      'Duo Chat is available with GitLab Duo Pro or Duo Enterprise. Contact your administrator to upgrade.',
      query,
      (response) => response.currentUser.duoClassicChatAvailable,
      { failOpen: true },
    );
  }

  onChanged(listener: (data: StateCheckChangedEventData) => void): Disposable {
    return this.#apiStateCheck.onChanged(listener);
  }

  get engaged() {
    return this.#apiStateCheck.engaged;
  }

  id = CLASSIC_CHAT_NO_LICENSE;

  get details() {
    return this.#apiStateCheck.details;
  }

  dispose() {
    this.#apiStateCheck.dispose();
  }

  async validate(config: ClientConfig): Promise<FeatureStateCheck<StateCheckId> | undefined> {
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
