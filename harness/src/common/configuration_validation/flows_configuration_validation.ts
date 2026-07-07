import { createInterfaceId, Injectable } from '@gitlab/needle';
import { FeatureState, FeatureStateCheck, FLOWS, StateCheckId } from '@gitlab-org/core';
import { ClientConfig } from '@gitlab-org/config';
import {
  AgentPlatformEnabledCheck,
  FlowsInstanceFlagCheck,
  StateConfigCheck,
} from '@gitlab-org/feature-state';
import { ProjectDuoAccessCheck } from '../feature_state';
import { ConfigurationValidator } from './configuration_validator';

export type FlowsConfigurationValidator = ConfigurationValidator;

export const FlowsConfigurationValidator = createInterfaceId<FlowsConfigurationValidator>(
  'FlowsConfigurationValidator',
);

@Injectable(FlowsConfigurationValidator, [
  ProjectDuoAccessCheck,
  FlowsInstanceFlagCheck,
  AgentPlatformEnabledCheck,
])
export class DefaultFlowsConfigurationValidator implements FlowsConfigurationValidator {
  #orderedChecks: StateConfigCheck[] = [];

  #allChecks: FeatureStateCheck<StateCheckId>[] = [];

  #engagedChecks: FeatureStateCheck<StateCheckId>[] = [];

  constructor(
    projectDuoAccessCheck: ProjectDuoAccessCheck,
    flowsInstanceFlagCheck: FlowsInstanceFlagCheck,
    agentPlatformEnabledCheck: AgentPlatformEnabledCheck,
  ) {
    this.#orderedChecks = [
      projectDuoAccessCheck,
      flowsInstanceFlagCheck,
      agentPlatformEnabledCheck,
    ];
  }

  feature = FLOWS;

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
