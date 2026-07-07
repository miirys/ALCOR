import { createInterfaceId } from '@gitlab/needle';
import { ActionExecutor } from './action_executor';

export interface ActionExecutorFactory {
  createExecutor(): ActionExecutor;
}

export const ActionExecutorFactory =
  createInterfaceId<ActionExecutorFactory>('ActionExecutorFactory');
