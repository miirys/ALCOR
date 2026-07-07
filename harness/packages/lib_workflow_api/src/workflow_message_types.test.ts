import {
  DuoWorkflowStatus,
  WorkflowStatusCode,
  isDuoWorkflowEvent,
  isTransientStatusCode,
  isWorkflowExecutorErrorEvent,
  isWorkflowRetryEvent,
  type DuoWorkflowEvent,
  type WorkflowRetryEvent,
} from './workflow_message_types';
import { WorkflowExecutorError } from './workflow_executor_error';

describe('workflow_message_types guards', () => {
  const checkpointEvent: DuoWorkflowEvent = {
    checkpoint: 'cp',
    errors: [],
    workflowGoal: 'goal',
    workflowStatus: DuoWorkflowStatus.RUNNING,
  };

  const retryEvent: WorkflowRetryEvent = {
    kind: 'retry',
    attempt: 1,
    maxAttempts: 5,
    backoffMs: 1000,
  };

  const errorEvent = new WorkflowExecutorError('boom', WorkflowStatusCode.GENERAL_FAILURE);

  describe('isDuoWorkflowEvent', () => {
    it('accepts a checkpoint event with a valid workflowStatus', () => {
      expect(isDuoWorkflowEvent(checkpointEvent)).toBe(true);
    });

    it('accepts a checkpoint event whose checkpoint field is undefined', () => {
      // Real emitted events may carry `checkpoint: undefined`; workflowStatus is
      // the reliable discriminator.
      expect(
        isDuoWorkflowEvent({
          checkpoint: undefined,
          errors: [],
          workflowGoal: 'goal',
          workflowStatus: DuoWorkflowStatus.FINISHED,
        }),
      ).toBe(true);
    });

    it('rejects a retry event', () => {
      expect(isDuoWorkflowEvent(retryEvent)).toBe(false);
    });

    it('rejects an executor error event', () => {
      expect(isDuoWorkflowEvent(errorEvent)).toBe(false);
    });

    it('rejects an object with an invalid workflowStatus value', () => {
      expect(isDuoWorkflowEvent({ workflowStatus: 'NOT_A_STATUS' })).toBe(false);
    });

    it('rejects null and non-objects', () => {
      expect(isDuoWorkflowEvent(null)).toBe(false);
      expect(isDuoWorkflowEvent(undefined)).toBe(false);
      expect(isDuoWorkflowEvent('checkpoint')).toBe(false);
      expect(isDuoWorkflowEvent(42)).toBe(false);
    });
  });

  describe('isWorkflowRetryEvent', () => {
    it('accepts a well-formed retry event', () => {
      expect(isWorkflowRetryEvent(retryEvent)).toBe(true);
    });

    it('rejects a retry-shaped object with non-numeric fields', () => {
      expect(
        isWorkflowRetryEvent({
          kind: 'retry',
          attempt: '1',
          maxAttempts: 5,
          backoffMs: 1000,
        }),
      ).toBe(false);
    });

    it('rejects a retry-shaped object missing numeric fields', () => {
      expect(isWorkflowRetryEvent({ kind: 'retry' })).toBe(false);
    });

    it('rejects a checkpoint event', () => {
      expect(isWorkflowRetryEvent(checkpointEvent)).toBe(false);
    });

    it('rejects null and non-objects', () => {
      expect(isWorkflowRetryEvent(null)).toBe(false);
      expect(isWorkflowRetryEvent('retry')).toBe(false);
    });
  });

  describe('isWorkflowExecutorErrorEvent', () => {
    it('accepts a WorkflowExecutorError', () => {
      expect(isWorkflowExecutorErrorEvent(errorEvent)).toBe(true);
    });

    it('rejects a checkpoint and retry event', () => {
      expect(isWorkflowExecutorErrorEvent(checkpointEvent)).toBe(false);
      expect(isWorkflowExecutorErrorEvent(retryEvent)).toBe(false);
    });
  });

  describe('isTransientStatusCode', () => {
    it.each([
      WorkflowStatusCode.SERVICE_CONNECTION_DROPPED,
      WorkflowStatusCode.SERVICE_CONNECTION_CLOSED_MESSAGE_TOO_BIG,
      WorkflowStatusCode.SERVICE_CONNECTION_BAD_GATEWAY,
      WorkflowStatusCode.SERVICE_CONNECTION_TLS_HANDSHAKE,
      WorkflowStatusCode.SERVICE_CONNECTION_UNSUPPORTED_DATA_TYPE,
      WorkflowStatusCode.LOCKED_SOCKET,
      WorkflowStatusCode.USAGE_QUOTA_EXCEEDED,
    ])('treats connection-level code %s as transient', (statusCode) => {
      expect(isTransientStatusCode(statusCode)).toBe(true);
    });

    it.each([
      WorkflowStatusCode.GENERAL_FAILURE,
      WorkflowStatusCode.FAILED_TO_START,
      WorkflowStatusCode.AUTH_TOKEN_ERROR,
      WorkflowStatusCode.SERVICE_CONNECTION_INTERNAL_ERROR,
    ])('treats unlisted code %s as non-transient', (statusCode) => {
      expect(isTransientStatusCode(statusCode)).toBe(false);
    });
  });
});
