import {
  DuoWorkflowCheckpoint,
  ParsedDuoWorkflowEvent,
  DuoWorkflowEventConnection,
  DuoWorkflowStatus,
  DuoWorkflowEvent,
} from '@gitlab-lsp/workflow-api';

export const defaultCheckpoint = {
  checkpoint: {
    ts: expect.any(String),
    channel_values: { status: 'Planning' },
  },
  errors: [],
  workflowStatus: DuoWorkflowStatus.RUNNING,
  workflowGoal: '',
};

const PLANNING_CHECKPOINT: DuoWorkflowCheckpoint = {
  ts: '2024-08-14T19:02:32.881580+00:00',
  channel_values: { status: 'Planning' },
};

const EXECUTING_CHECKPOINT: DuoWorkflowCheckpoint = {
  ts: '2024-08-15T19:02:32.881580+00:00',
  channel_values: { status: 'Execution' },
};
const COMPLETED_CHECKPOINT: DuoWorkflowCheckpoint = {
  ts: '2024-08-16T19:02:32.881580+00:00',
  channel_values: { status: 'Completed' },
};

export const DUO_EVENT_PLANNING: ParsedDuoWorkflowEvent = {
  checkpoint: PLANNING_CHECKPOINT,
  errors: [],
  workflowStatus: DuoWorkflowStatus.RUNNING,
  workflowGoal: '',
};

export const DUO_EVENT_EXECUTING: ParsedDuoWorkflowEvent = {
  checkpoint: EXECUTING_CHECKPOINT,
  errors: [],
  workflowStatus: DuoWorkflowStatus.RUNNING,
  workflowGoal: '',
};

export const DUO_EVENT_COMPLETED: ParsedDuoWorkflowEvent = {
  checkpoint: COMPLETED_CHECKPOINT,
  errors: [],
  workflowStatus: DuoWorkflowStatus.FINISHED,
  workflowGoal: '',
};

const LANG_EVENT_PLANNING: DuoWorkflowEvent = {
  checkpoint: JSON.stringify(PLANNING_CHECKPOINT),
  workflowStatus: DuoWorkflowStatus.RUNNING,
  errors: [],
  workflowGoal: '',
};

export const LANG_EVENT_EXECUTING: DuoWorkflowEvent = {
  checkpoint: JSON.stringify(EXECUTING_CHECKPOINT),
  workflowStatus: DuoWorkflowStatus.RUNNING,
  errors: [],
  workflowGoal: '',
};

const LANG_EVENT_COMPLETED: DuoWorkflowEvent = {
  checkpoint: JSON.stringify(COMPLETED_CHECKPOINT),
  workflowStatus: DuoWorkflowStatus.FINISHED,
  errors: [],
  workflowGoal: '',
};

export const langGraphPayload: DuoWorkflowEventConnection = {
  duoWorkflowEvents: {
    nodes: [LANG_EVENT_EXECUTING, LANG_EVENT_COMPLETED, LANG_EVENT_PLANNING],
  },
  duoWorkflowWorkflows: {
    nodes: [
      {
        id: 'gid://gitlab/Ai::DuoWorkflows::Workflow/1',
        status: DuoWorkflowStatus.RUNNING,
      },
    ],
  },
};

export const parsedLangGraphPayload = [
  DUO_EVENT_EXECUTING,
  DUO_EVENT_COMPLETED,
  DUO_EVENT_PLANNING,
];
