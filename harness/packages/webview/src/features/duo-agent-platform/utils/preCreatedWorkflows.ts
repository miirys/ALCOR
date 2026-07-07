import type { DuoWorkflowInfo } from '@gitlab-org/graphql';

export const NUM_PROMPT_CHARS_BEFORE_PRE_CREATING_WORKFLOW = 3;

/**
 * If a workflow is created with a short goal and does not have any checkpoints, we consider it a
 * pre-created "dangling" workflow (e.g. one that was never run after pre-creation)
 */
export function isDanglingPreCreatedWorkflow(workflow: DuoWorkflowInfo) {
  return (
    workflow.latestCheckpoint === null &&
    workflow.humanStatus === 'created' &&
    workflow.goal &&
    workflow.goal.length <= NUM_PROMPT_CHARS_BEFORE_PRE_CREATING_WORKFLOW
  );
}
