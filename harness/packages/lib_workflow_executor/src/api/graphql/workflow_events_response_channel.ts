import { Channel, ChannelEvents } from '@anycable/core';
import { gql } from 'graphql-request';
import type { DuoWorkflowEvent } from '@gitlab-lsp/workflow-api';

type WorkflowEventsInput = {
  workflowId: string;
};

type WorkflowEventsParams = {
  channel: 'GraphqlChannel';
  query: string;
  variables: string;
  operationName: 'workflowEventsUpdated';
};

const WORKFLOW_EVENTS_SUBSCRIPTION_QUERY = gql`
  subscription workflowEventsUpdated($workflowId: AiDuoWorkflowsWorkflowID!) {
    workflowEventsUpdated(workflowId: $workflowId) {
      checkpoint
      workflowStatus
      errors
      metadata
      workflowGoal
    }
  }
`;

type WorkflowEventsResponseType = {
  result: {
    data: {
      workflowEventsUpdated: DuoWorkflowEvent;
    };
  };
  more: boolean;
};

interface WorkflowEventsChannelEvents extends ChannelEvents<WorkflowEventsResponseType> {
  checkpoint: (msg: DuoWorkflowEvent) => void;
}

export class WorkflowEventsChannel extends Channel<
  WorkflowEventsParams,
  WorkflowEventsResponseType,
  WorkflowEventsChannelEvents
> {
  static identifier = 'GraphqlChannel';

  constructor(params: WorkflowEventsInput) {
    super({
      channel: 'GraphqlChannel',
      query: WORKFLOW_EVENTS_SUBSCRIPTION_QUERY,
      variables: JSON.stringify(params),
      operationName: 'workflowEventsUpdated',
    });
  }

  receive(message: WorkflowEventsResponseType) {
    if (!message.result.data.workflowEventsUpdated) return;

    const data = message.result.data.workflowEventsUpdated;

    this.emit('checkpoint', data);
  }
}
