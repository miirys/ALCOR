import { WorkflowExecutorError, WorkflowStatusCode } from '@gitlab-lsp/workflow-api';
import { resolveWorkflowStatusCode } from './resolve_status_code';

describe('resolveWorkflowStatusCode', () => {
  it('returns the statusCode of a WorkflowExecutorError', () => {
    const error = new WorkflowExecutorError('boom', WorkflowStatusCode.AUTH_TOKEN_ERROR);

    expect(resolveWorkflowStatusCode(error)).toBe(WorkflowStatusCode.AUTH_TOKEN_ERROR);
  });

  it('preserves a raw numeric WorkflowStatusCode without invoking the fallback', () => {
    const fallback = jest.fn().mockReturnValue(WorkflowStatusCode.GENERAL_FAILURE);

    expect(resolveWorkflowStatusCode(WorkflowStatusCode.AUTH_TOKEN_ERROR, fallback)).toBe(
      WorkflowStatusCode.AUTH_TOKEN_ERROR,
    );
    expect(fallback).not.toHaveBeenCalled();
  });

  it('defaults to GENERAL_FAILURE for an unrecognised error', () => {
    expect(resolveWorkflowStatusCode(new Error('something else'))).toBe(
      WorkflowStatusCode.GENERAL_FAILURE,
    );
  });

  it('uses the provided fallback for an unrecognised error', () => {
    const fallback = jest.fn().mockReturnValue(WorkflowStatusCode.SERVICE_CONNECTION_FAILED);
    const error = new Error('client error');

    expect(resolveWorkflowStatusCode(error, fallback)).toBe(
      WorkflowStatusCode.SERVICE_CONNECTION_FAILED,
    );
    expect(fallback).toHaveBeenCalledWith(error);
  });
});
