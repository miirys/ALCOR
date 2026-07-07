export const NUM_PROMPT_CHARS_BEFORE_PRE_CREATING_WORKFLOW = 3;

/**
 * When a workflow is pre-created, the `goal` will only contain the first 3 characters of the users initial prompt (we
 * start pre-creating once they start typing). This results in the chat history showing an incorrect title for old
 * conversations (only the first three characters). This utility function parses the firstCheckpoint, which is now
 * available when querying for workflows, and sets the `goal` manually to the first messages value.
 *
 * This is not ideal, we should ideally set the `goal` correctly on the backend once a pre-created workflow has started
 * and rails receives an update with the actual full goal: https://gitlab.com/gitlab-org/gitlab/-/issues/553499
 */
function fixPreCreatedWorkflowGoal(workflow) {
  try {
    const firstCheckpoint = workflow.firstCheckpoint?.checkpoint
      ? JSON.parse(workflow.firstCheckpoint?.checkpoint)
      : null;
    // eslint-disable-next-line no-underscore-dangle
    const firstMessage = firstCheckpoint?.channel_values?.__start__?.ui_chat_log?.at(0)?.content;
    if (firstMessage && firstMessage !== workflow.goal) {
      return { ...workflow, goal: firstMessage };
    }
  } catch (e) {
    console.error(
      'Failed to parse first workflow checkpoint and set correct goal. Chat history titles may show incorrectly.',
      e,
    );
  }
  return workflow;
}

/**
 * If a workflow is created with a short goal and does not have any checkpoints, we consider it a
 * pre-created "dangling" workflow (e.g. one that was never run after pre-creation)
 */
function isDanglingPreCreatedWorkflow(workflow) {
  return (
    workflow.firstCheckpoint === null &&
    workflow.humanStatus === 'created' &&
    workflow.goal.length <= NUM_PROMPT_CHARS_BEFORE_PRE_CREATING_WORKFLOW
  );
}

export function processPreCreatedWorkflows(workflows) {
  return workflows
    .filter((workflow) => !isDanglingPreCreatedWorkflow(workflow))
    .map((workflow) => fixPreCreatedWorkflowGoal(workflow));
}
