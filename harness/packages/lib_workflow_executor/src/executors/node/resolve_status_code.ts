import { WorkflowExecutorError, WorkflowStatusCode } from '@gitlab-lsp/workflow-api';

/**
 * Resolve a thrown/rejected value to a {@link WorkflowStatusCode}.
 *
 * @param fallback - resolves an unrecognised error; defaults to
 *   `GENERAL_FAILURE`. Callers with richer context (e.g. websocket client
 *   errors) can pass `mapClientErrorToUserFacingStatusCode`.
 */
export function resolveWorkflowStatusCode(
  error: unknown,
  fallback: (error: unknown) => WorkflowStatusCode = () => WorkflowStatusCode.GENERAL_FAILURE,
): WorkflowStatusCode {
  if (error instanceof WorkflowExecutorError) {
    return error.statusCode;
  }
  if (typeof error === 'number') {
    return error;
  }
  return fallback(error);
}
