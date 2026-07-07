import {
  ParsedDuoWorkflowEvent,
  DuoWorkflowStatus,
  DuoWorkflowEvent,
  DuoWorkflowEventConnection,
  parseLangGraphCheckpoint,
  parseWorkflowEventsResponse,
} from '@gitlab-lsp/workflow-api';

export { getLatestEvent, parseWorkflowEventsResponse } from '@gitlab-lsp/workflow-api';

export const getLatestCheckpoint = (
  duoWorkflowEvents: ParsedDuoWorkflowEvent[],
): ParsedDuoWorkflowEvent => {
  if (!duoWorkflowEvents.length) {
    return {
      errors: [],
      workflowStatus: DuoWorkflowStatus.RUNNING,
      checkpoint: {
        ts: new Date().toISOString(),
        channel_values: {
          status: 'Planning' as const,
        },
      },
      workflowGoal: '',
    };
  }

  const sortedCheckpoints = [...duoWorkflowEvents].sort(
    (a: ParsedDuoWorkflowEvent, b: ParsedDuoWorkflowEvent) => {
      return new Date(b.checkpoint.ts).getTime() - new Date(a.checkpoint.ts).getTime();
    },
  );

  // sortedCheckpoints[0] is guaranteed to exist because we checked duoWorkflowEvents.length above
  return sortedCheckpoints[0] as ParsedDuoWorkflowEvent;
};

export const parseWorkflowData = (response: DuoWorkflowEventConnection): ParsedDuoWorkflowEvent => {
  const rawEvents = parseWorkflowEventsResponse(response);
  const results = rawEvents.map((node: DuoWorkflowEvent) => {
    // TODO: Remove once we are no longer using LangGraph internal data structure.
    return { ...node, checkpoint: parseLangGraphCheckpoint(node.checkpoint) };
  });

  // TODO: Remove once we have guaranteed order.
  return getLatestCheckpoint(results);
};
