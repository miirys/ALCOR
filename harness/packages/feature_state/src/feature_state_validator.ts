import { Injectable, createInterfaceId } from '@gitlab/needle';
import {
  AGENT_PLATFORM,
  CHAT,
  CODE_SUGGESTIONS,
  Feature,
  FeatureState,
  FeatureStateCheck,
  FLOWS,
  StateCheckId,
} from '@gitlab-org/core';
import { ClientConfig } from '@gitlab-org/config';
import { ChatEnabledConfigCheck } from './chat_enabled_check';
import { CodeSuggestionsEnabledConfigCheck } from './code_suggestions_enabled_check';
import { AgentPlatformEnabledConfigCheck } from './agent_platform/agent_platform_enabled_check';
import { FlowsInstanceFlagConfigCheck } from './flows/flows_instance_flag_check';
import { StateConfigCheck } from './state_check';

/**
 * Stateless snapshot of feature state from a {@link ClientConfig}.
 */
export interface FeatureStateValidator {
  validate(config: ClientConfig): Promise<FeatureState[]>;
}

export const FeatureStateValidator =
  createInterfaceId<FeatureStateValidator>('FeatureStateValidator');

@Injectable(FeatureStateValidator, [
  ChatEnabledConfigCheck,
  CodeSuggestionsEnabledConfigCheck,
  AgentPlatformEnabledConfigCheck,
  FlowsInstanceFlagConfigCheck,
])
export class DefaultFeatureStateValidator implements FeatureStateValidator {
  #checksByFeature: readonly (readonly [Feature, readonly StateConfigCheck[]])[];

  constructor(
    chatEnabledCheck: StateConfigCheck,
    codeSuggestionsEnabledCheck: StateConfigCheck,
    agentPlatformEnabledCheck: StateConfigCheck,
    flowsInstanceFlagCheck: StateConfigCheck,
  ) {
    this.#checksByFeature = [
      [CHAT, [chatEnabledCheck]],
      [CODE_SUGGESTIONS, [codeSuggestionsEnabledCheck]],
      [AGENT_PLATFORM, [agentPlatformEnabledCheck]],
      [FLOWS, [flowsInstanceFlagCheck]],
    ];
  }

  async validate(config: ClientConfig): Promise<FeatureState[]> {
    return Promise.all(
      this.#checksByFeature.map(async ([featureId, checks]) => {
        const allChecks = (await Promise.all(checks.map((check) => check.validate(config)))).filter(
          (c): c is FeatureStateCheck<StateCheckId> => c !== undefined,
        );

        return {
          featureId,
          engagedChecks: allChecks.filter((c) => c.engaged),
          allChecks,
        };
      }),
    );
  }
}
