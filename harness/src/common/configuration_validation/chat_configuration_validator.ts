import { createInterfaceId, Injectable } from '@gitlab/needle';
import { CHAT, FeatureState, FeatureStateCheck, StateCheckId } from '@gitlab-org/core';
import { ClientConfig } from '@gitlab-org/config';
import { ChatEnabledCheck, StateConfigCheck } from '@gitlab-org/feature-state';
import { ProjectDuoAccessCheck } from '../feature_state';
import { DuoChatLicenseCheck } from '../feature_state/duo_chat_license_check';
import { ConfigurationValidator } from './configuration_validator';

export type ChatConfigurationValidator = ConfigurationValidator;

export const ChatConfigurationValidator = createInterfaceId<ChatConfigurationValidator>(
  'ChatConfigurationValidator',
);

@Injectable(ChatConfigurationValidator, [
  ProjectDuoAccessCheck,
  DuoChatLicenseCheck,
  ChatEnabledCheck,
])
export class DefaultChatConfigurationValidator implements ChatConfigurationValidator {
  #orderedChecks: StateConfigCheck[] = [];

  #allChecks: FeatureStateCheck<StateCheckId>[] = [];

  #engagedChecks: FeatureStateCheck<StateCheckId>[] = [];

  constructor(
    projectDuoAccessCheck: ProjectDuoAccessCheck,
    duoChatLicenseCheck: DuoChatLicenseCheck,
    duoChatEnabledCheck: ChatEnabledCheck,
  ) {
    this.#orderedChecks = [projectDuoAccessCheck, duoChatLicenseCheck, duoChatEnabledCheck];
  }

  feature = CHAT;

  async validate(config: ClientConfig): Promise<FeatureState> {
    this.#allChecks = (await Promise.all(
      this.#orderedChecks.map((check) => check.validate(config)),
    )) as FeatureStateCheck<StateCheckId>[];

    this.#engagedChecks = this.#allChecks.filter((check) => check.engaged);

    return { featureId: CHAT, engagedChecks: this.#engagedChecks, allChecks: this.#allChecks };
  }
}
