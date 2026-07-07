import { DuoWorkflowEvent, DuoWorkflowEventConnection } from './workflow_message_types';

export const generateGraphqlWorkflowId = (workflowId: string): string => {
  return `gid://gitlab/Ai::DuoWorkflows::Workflow/${workflowId}`;
};

export const parseWorkflowEventsResponse = (
  response: DuoWorkflowEventConnection,
): DuoWorkflowEvent[] => {
  return response?.duoWorkflowEvents?.nodes || [];
};

export const getLatestEvent = (response: DuoWorkflowEventConnection): DuoWorkflowEvent | null => {
  const events = parseWorkflowEventsResponse(response);

  if (events.length === 0) return null;

  return events[0] ?? null;
};
