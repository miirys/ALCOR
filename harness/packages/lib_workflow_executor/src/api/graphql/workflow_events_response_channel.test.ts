import { DuoWorkflowStatus, DuoWorkflowEvent } from '@gitlab-lsp/workflow-api';
import { WorkflowEventsChannel } from './workflow_events_response_channel';

describe('WorkflowEventsChannel', () => {
  let channel: WorkflowEventsChannel;
  let emittedEvents: { event: string; message: DuoWorkflowEvent }[];

  const workflowEventMock = {
    checkpoint: 'new checkpoint',
    errors: [],
    metadata: 'metadata',
    workflowStatus: DuoWorkflowStatus.FINISHED,
    workflowGoal: '',
  };

  beforeEach(() => {
    channel = new WorkflowEventsChannel({ workflowId: '1' });
    emittedEvents = [];

    channel.on('checkpoint', (message) => {
      emittedEvents.push({ event: 'checkpoint', message });
    });
  });

  it('emits "checkpoint" when message is received with checkpoint', () => {
    channel.receive({ result: { data: { workflowEventsUpdated: workflowEventMock } }, more: true });

    expect(emittedEvents[0]).toStrictEqual({ message: workflowEventMock, event: 'checkpoint' });
  });
});
