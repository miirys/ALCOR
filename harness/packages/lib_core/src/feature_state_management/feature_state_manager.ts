import { Disposable } from '@gitlab-org/disposable';
import { createInterfaceId } from '@gitlab/needle';
import { Notifier } from '../notifier';
import { FeatureState } from './types';

export type FeatureStateNotificationParams = FeatureState[];

export interface FeatureStateManager extends Notifier<FeatureStateNotificationParams>, Disposable {
  onChange(listener: (data: FeatureState[]) => void): Disposable;
}
export const FeatureStateManager = createInterfaceId<FeatureStateManager>('FeatureStateManager');
