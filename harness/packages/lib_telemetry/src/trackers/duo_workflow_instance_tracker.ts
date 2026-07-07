import { createInterfaceId } from '@gitlab/needle';
import { TelemetryService } from '../service';

export enum DUO_WORKFLOW_EVENT {
  START = 'start_duo_workflow_execution',
  FINISH = 'finish_duo_workflow_execution',
  RETRY = 'retry_duo_workflow_execution',
}

export interface DuoWorkflowContext {
  workflow_id: string;
}

export interface DuoWorkflowTracker
  extends TelemetryService<DUO_WORKFLOW_EVENT, DuoWorkflowContext, null> {}

export const DuoWorkflowTracker = createInterfaceId<DuoWorkflowTracker>('DuoWorkflowTracker');
