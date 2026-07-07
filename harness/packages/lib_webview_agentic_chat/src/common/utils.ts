import { DuoWorkflowStatus } from '@gitlab-lsp/workflow-api';

export { generateGraphqlWorkflowId } from '@gitlab-lsp/workflow-api';

export const getIDfromGraphqlId = (graphqId: string): string => {
  const match = graphqId.match(/\d+$/);
  if (!match?.length) {
    throw new Error(`Invalid graphqlId: ${graphqId}`);
  }

  return match[0];
};

const DUO_WORKFLOW_STATUS_DISPLAY = {
  [DuoWorkflowStatus.CREATED]: 'Created',
  [DuoWorkflowStatus.RUNNING]: 'Running',
  [DuoWorkflowStatus.FINISHED]: 'Complete',
  [DuoWorkflowStatus.FAILED]: 'Failed',
  [DuoWorkflowStatus.STOPPED]: 'Stopped',
  [DuoWorkflowStatus.INPUT_REQUIRED]: 'Needs input',
  [DuoWorkflowStatus.PLAN_APPROVAL]: 'Needs input',
  [DuoWorkflowStatus.TOOL_APPROVAL]: 'Needs input',
};

export const getDuoWorkflowStatusDisplay = (status: DuoWorkflowStatus) =>
  DUO_WORKFLOW_STATUS_DISPLAY[status];
