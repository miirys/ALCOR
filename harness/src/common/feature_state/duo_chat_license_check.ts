import { gql } from 'graphql-request';
import { Disposable } from '@gitlab-org/disposable';
import { createInterfaceId, Injectable } from '@gitlab/needle';
import { ApiRequest, CHAT_NO_LICENSE, FeatureStateCheck, StateCheckId } from '@gitlab-org/core';
import { ClientConfig } from '@gitlab-org/config';
import {
  StateCheck,
  StateCheckChangedEventData,
  StateConfigCheck,
} from '@gitlab-org/feature-state';
import { GitLabApiClient } from '../api';
import { ApiStateCheck } from './api_state_check';

export type DuoChatLicenseCheck = StateCheck<typeof CHAT_NO_LICENSE> & StateConfigCheck;

export const DuoChatLicenseCheck = createInterfaceId<DuoChatLicenseCheck>('DuoChatLicenseCheck');

export interface GqlDuoChatAvailable {
  currentUser: {
    duoChatAvailable: boolean;
  };
}

const query = {
  type: 'graphql',
  query: gql`
    query chatAvailable {
      currentUser {
        duoChatAvailable
      }
    }
  `,
  variables: {},
  supportedSinceInstanceVersion: {
    version: '16.8.0',
    resourceName: 'get current user Duo Chat license',
  },
} satisfies ApiRequest<GqlDuoChatAvailable>;

@Injectable(DuoChatLicenseCheck, [GitLabApiClient])
export class DefaultDuoChatLicenseCheck implements DuoChatLicenseCheck {
  #apiStateCheck: ApiStateCheck<GqlDuoChatAvailable>;

  constructor(api: GitLabApiClient) {
    this.#apiStateCheck = new ApiStateCheck(
      api,
      this.id,
      'A GitLab Duo license is required to use this feature. Contact your GitLab administrator to request access.',
      query,
      (response) => response.currentUser.duoChatAvailable,
    );
  }

  onChanged(listener: (data: StateCheckChangedEventData) => void): Disposable {
    return this.#apiStateCheck.onChanged(listener);
  }

  get engaged() {
    return this.#apiStateCheck.engaged;
  }

  id = CHAT_NO_LICENSE;

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
