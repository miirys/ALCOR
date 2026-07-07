import { Disposable } from '@gitlab-org/disposable';
import { StateCheckId, StateCheckContext, FeatureStateCheck } from '@gitlab-org/core';
import { ClientConfig } from '@gitlab-org/config';

export interface StateCheckChangedEventData {
  checkId: StateCheckId;
  engaged: boolean;
  details?: string;
}

export interface StateCheck<
  T extends StateCheckId,
  EventData extends StateCheckChangedEventData = StateCheckChangedEventData,
> {
  id: T;
  engaged: boolean;
  init?: () => Promise<void>;
  /** registers a listener that's called when the policy changes */
  onChanged: (listener: (data: EventData) => void) => Disposable;
  details?: string;
  context?: StateCheckContext<T>;
}

export interface StateConfigCheck {
  validate(config: ClientConfig): Promise<FeatureStateCheck<StateCheckId> | undefined>;
}
