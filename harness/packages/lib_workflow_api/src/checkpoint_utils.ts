import { Result, ok, err } from 'neverthrow';
import {
  DuoWorkflowLatestCheckpoint,
  ParsedDuoWorkflowEvent,
  DuoWorkflowStatus,
  DuoWorkflowCheckpoint,
} from './workflow_message_types';

export const parseLangGraphCheckpoint = (langGraphCheckpoint: string): DuoWorkflowCheckpoint => {
  try {
    return JSON.parse(langGraphCheckpoint);
  } catch {
    // FIXME: process the error
    throw new Error('Failed to parse checkpoint');
  }
};

/**
 * When a workflow/chat is first started, the latestCheckpoint returned from backend is null,
 * so we default to this initial hardcoded RUNNING checkpoint until we get our next actual
 * checkpoint returned.
 */
export const createDefaultWorkflowEvent = (): ParsedDuoWorkflowEvent => {
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
};

export const parseLatestCheckpointWorkflowData = (
  response: DuoWorkflowLatestCheckpoint,
): Result<ParsedDuoWorkflowEvent, Error> => {
  try {
    const { latestCheckpoint } = response?.duoWorkflowWorkflows?.nodes?.[0] ?? {};

    if (!latestCheckpoint) {
      return ok(createDefaultWorkflowEvent());
    }

    const parsedCheckpoint = parseLangGraphCheckpoint(latestCheckpoint.checkpoint);
    return ok({
      ...latestCheckpoint,
      // TODO: Remove once we are no longer using LangGraph internal data structure.
      checkpoint: parsedCheckpoint,
    });
  } catch (error) {
    return err(
      new Error(
        `Failed to parse latest workflow checkpoint: ${error instanceof Error ? error.message : String(error)}`,
      ),
    );
  }
};

export const getStatus = (duoWorkflowEvent: ParsedDuoWorkflowEvent): DuoWorkflowStatus => {
  return duoWorkflowEvent.workflowStatus;
};
