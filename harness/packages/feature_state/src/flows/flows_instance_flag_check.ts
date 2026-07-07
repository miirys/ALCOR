/* eslint-disable max-classes-per-file */
import EventEmitter from 'events';
import { Disposable } from '@gitlab-org/disposable';
import { createInterfaceId, Injectable } from '@gitlab/needle';
import {
  InstanceFeatureFlagsService,
  InstanceFeatureFlags,
  FLOWS_INSTANCE_FLAG_DISABLED,
  FeatureStateCheck,
  StateCheckId,
} from '@gitlab-org/core';
import { Logger, withPrefix } from '@gitlab-org/logging';
import { ClientConfig } from '@gitlab-org/config';
import { StateCheck, StateCheckChangedEventData, StateConfigCheck } from '../state_check';

const FLOWS_FLAG_DISABLED_DETAILS =
  'Flows feature flag is disabled on this GitLab instance. Contact your GitLab administrator to enable the duo_workflow feature flag.';
const FLOWS_FLAG_ENABLED_DETAILS = 'Flows feature flag is enabled on this GitLab instance';

export const FlowsInstanceFlagConfigCheck = createInterfaceId<StateConfigCheck>(
  'FlowsInstanceFlagConfigCheck',
);

@Injectable(FlowsInstanceFlagConfigCheck, [InstanceFeatureFlagsService])
export class DefaultFlowsInstanceFlagConfigCheck implements StateConfigCheck {
  #featureFlagsService: InstanceFeatureFlagsService;

  constructor(featureFlagsService: InstanceFeatureFlagsService) {
    this.#featureFlagsService = featureFlagsService;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async validate(_config: ClientConfig): Promise<FeatureStateCheck<StateCheckId> | undefined> {
    const flagEnabled = this.#featureFlagsService.isInstanceFlagEnabled(
      InstanceFeatureFlags.DuoWorkflow,
    );
    const engaged = !flagEnabled;
    return {
      checkId: FLOWS_INSTANCE_FLAG_DISABLED,
      details: engaged ? FLOWS_FLAG_DISABLED_DETAILS : FLOWS_FLAG_ENABLED_DETAILS,
      engaged,
    };
  }
}

export type FlowsInstanceFlagCheck = StateCheck<typeof FLOWS_INSTANCE_FLAG_DISABLED> &
  StateConfigCheck;

export const FlowsInstanceFlagCheck =
  createInterfaceId<FlowsInstanceFlagCheck>('FlowsInstanceFlagCheck');

@Injectable(FlowsInstanceFlagCheck, [InstanceFeatureFlagsService, Logger])
export class DefaultFlowsInstanceFlagCheck implements FlowsInstanceFlagCheck, StateConfigCheck {
  #configCheck: DefaultFlowsInstanceFlagConfigCheck;

  #featureFlagsService: InstanceFeatureFlagsService;

  #logger: Logger;

  #subscriptions: Disposable[] = [];

  #stateEmitter = new EventEmitter();

  #flagEnabled = false;

  constructor(featureFlagsService: InstanceFeatureFlagsService, logger: Logger) {
    this.#featureFlagsService = featureFlagsService;
    this.#logger = withPrefix(logger, '[FlowsInstanceFlagCheck]');
    this.#configCheck = new DefaultFlowsInstanceFlagConfigCheck(featureFlagsService);

    const disposable = this.#featureFlagsService.onChanged?.((flags) => {
      const flagEnabled = flags.get(InstanceFeatureFlags.DuoWorkflow) ?? false;
      this.#logger.debug(
        `Flows instance feature flag changed to ${flagEnabled ? 'enabled' : 'disabled'}`,
      );
      this.#setFlagEnabled(flagEnabled);
    });

    if (disposable) {
      this.#subscriptions.push(disposable);
    }
  }

  onChanged(listener: (data: StateCheckChangedEventData) => void): Disposable {
    this.#stateEmitter.on('change', listener);

    return {
      dispose: () => this.#stateEmitter.removeListener('change', listener),
    };
  }

  get engaged() {
    return !this.#flagEnabled;
  }

  get details() {
    return this.engaged ? FLOWS_FLAG_DISABLED_DETAILS : FLOWS_FLAG_ENABLED_DETAILS;
  }

  id = FLOWS_INSTANCE_FLAG_DISABLED;

  dispose() {
    this.#subscriptions.forEach((subscription) => subscription.dispose());
    this.#subscriptions = [];
  }

  validate(config: ClientConfig): Promise<FeatureStateCheck<StateCheckId> | undefined> {
    return this.#configCheck.validate(config);
  }

  #setFlagEnabled(enabled: boolean): void {
    this.#flagEnabled = enabled;
    const eventData: StateCheckChangedEventData = {
      checkId: this.id,
      engaged: this.engaged,
      details: this.details,
    };
    this.#stateEmitter.emit('change', eventData);
  }
}
