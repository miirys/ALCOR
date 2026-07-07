import { WorkflowStatusCode } from './workflow_message_types';

export class WorkflowExecutorError extends Error {
  readonly statusCode: WorkflowStatusCode;

  constructor(message: string, statusCode: WorkflowStatusCode) {
    super(message);
    this.name = 'WorkflowExecutorError';
    this.statusCode = statusCode;

    Error.captureStackTrace?.(this, WorkflowExecutorError);
  }
}
