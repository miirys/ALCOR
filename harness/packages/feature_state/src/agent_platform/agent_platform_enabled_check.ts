/* eslint-disable max-classes-per-file */
import EventEmitter from 'events';
import { createInterfaceId, Injectable } from '@gitlab/needle';
import { Disposable } from '@gitlab-org/disposable';
import { AGENT_PLATFORM_DISABLED_BY_USER, FeatureStateCheck, StateCheckId } from '@gitlab-org/core';
import { ConfigService, ClientConfig } from '@gitlab-org/config';
import { StateCheck, StateCheckChangedEventData, StateConfigCheck } from '../state_check';

const AGENT_PLATFORM_DISABLED_DETAILS = 'Agent Platform disabled in settings.';
const AGENT_PLATFORM_ENABLED_DETAILS = 'Agent Platform is enabled.';

export const AgentPlatformEnabledConfigCheck = createInterfaceId<StateConfigCheck>(
  'AgentPlatformEnabledConfigCheck',
);

@Injectable(AgentPlatformEnabledConfigCheck, [])
export class DefaultAgentPlatformEnabledConfigCheck implements StateConfigCheck {
  async validate(config: ClientConfig): Promise<FeatureStateCheck<StateCheckId> | undefined> {
    const engaged = config.duo?.agentPlatform?.enabled === false;
    return {
      checkId: AGENT_PLATFORM_DISABLED_BY_USER,
      details: engaged ? AGENT_PLATFORM_DISABLED_DETAILS : AGENT_PLATFORM_ENABLED_DETAILS,
      engaged,
    };
  }
}

export type AgentPlatformEnabledCheck = StateCheck<typeof AGENT_PLATFORM_DISABLED_BY_USER> &
  StateConfigCheck;

export const AgentPlatformEnabledCheck = createInterfaceId<AgentPlatformEnabledCheck>(
  'AgentPlatformEnabledCheck',
);

@Injectable(AgentPlatformEnabledCheck, [ConfigService])
export class DefaultAgentPlatformEnabledCheck implements AgentPlatformEnabledCheck {
  #configCheck = new DefaultAgentPlatformEnabledConfigCheck();

  #subscriptions: Disposable[] = [];

  #stateEmitter = new EventEmitter();

  #isEnabledByUser = true;

  constructor(configService: ConfigService) {
    this.#subscriptions.push(
      configService.onConfigChange((config) => {
        const agentPlatformEnabled = config.duo?.agentPlatform?.enabled;

        if (agentPlatformEnabled !== undefined) {
          this.#isEnabledByUser = agentPlatformEnabled;
          this.#stateEmitter.emit('change', this);
        }
      }),
    );
  }

  id = AGENT_PLATFORM_DISABLED_BY_USER;

  details = AGENT_PLATFORM_DISABLED_DETAILS;

  get engaged() {
    return !this.#isEnabledByUser;
  }

  onChanged(listener: (data: StateCheckChangedEventData) => void): Disposable {
    this.#stateEmitter.on('change', listener);

    return {
      dispose: () => this.#stateEmitter.removeListener('change', listener),
    };
  }

  dispose() {
    this.#subscriptions.forEach((s) => s.dispose());
  }

  validate(config: ClientConfig): Promise<FeatureStateCheck<StateCheckId> | undefined> {
    return this.#configCheck.validate(config);
  }
}
