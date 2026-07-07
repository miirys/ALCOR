import { createInterfaceId, Injectable } from '@gitlab/needle';
import { AGENTIC_CHAT, FeatureState, FeatureStateCheck, StateCheckId } from '@gitlab-org/core';
import { ClientConfig } from '@gitlab-org/config';
import { AgentPlatformEnabledCheck, StateConfigCheck } from '@gitlab-org/feature-state';
import { ProjectDuoAccessCheck } from '../feature_state';
import { ConfigurationValidator } from './configuration_validator';

export type AgenticChatConfigurationValidator = ConfigurationValidator;

export const AgenticChatConfigurationValidator =
  createInterfaceId<AgenticChatConfigurationValidator>('AgenticChatConfigurationValidator');

@Injectable(AgenticChatConfigurationValidator, [ProjectDuoAccessCheck, AgentPlatformEnabledCheck])
export class DefaultAgenticChatConfigurationValidator implements AgenticChatConfigurationValidator {
  #orderedChecks: StateConfigCheck[] = [];

  #allChecks: FeatureStateCheck<StateCheckId>[] = [];

  #engagedChecks: FeatureStateCheck<StateCheckId>[] = [];

  constructor(
    projectDuoAccessCheck: ProjectDuoAccessCheck,
    agentPlatformEnabledCheck: AgentPlatformEnabledCheck,
  ) {
    this.#orderedChecks = [projectDuoAccessCheck, agentPlatformEnabledCheck];
  }

  feature = AGENTIC_CHAT;

  async validate(config: ClientConfig): Promise<FeatureState> {
    const results = await Promise.all(this.#orderedChecks.map((check) => check.validate(config)));

    this.#allChecks = results.filter(
      (check): check is FeatureStateCheck<StateCheckId> => check !== undefined,
    );

    this.#engagedChecks = this.#allChecks.filter((check) => check.engaged);

    return {
      featureId: this.feature,
      engagedChecks: this.#engagedChecks,
      allChecks: this.#allChecks,
    };
  }
}
