import { createInterfaceId } from '@gitlab/needle';

export interface WorkflowUrlOpenerService {
  openUrl(url: string): Promise<void>;
}

export const WorkflowUrlOpenerService = createInterfaceId<WorkflowUrlOpenerService>(
  'WorkflowUrlOpenerService',
);
