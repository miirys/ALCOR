import type { FlowStoreError } from '../persistence/flow_store';
import { FlowValidationCode } from './codes';
import type { FlowValidationIssue } from './types';

/**
 * Translate a {@link FlowStoreError} into the unified
 * {@link FlowValidationIssue} shape that flows over the wire.
 *
 * The `validation_error` variant already carries `issues[]`, produced at the
 * source (typically by `conversionErrorToIssues` at the resolver call site),
 * so this function is a passthrough for that case. The persistence-specific
 * variants (`io_error`, `not_found`, `invalid_format`) get wrapped in a
 * single issue with a stable `code` so downstream UI can render them
 * uniformly.
 */
export function flowStoreErrorToIssues(error: FlowStoreError): FlowValidationIssue[] {
  switch (error.type) {
    case 'validation_error':
      return error.issues;

    case 'invalid_format': {
      if (error.details && error.details.length > 0) {
        return error.details.map((message) => ({
          severity: 'error' as const,
          code: FlowValidationCode.Format,
          message,
        }));
      }
      return [{ severity: 'error', code: FlowValidationCode.Format, message: error.message }];
    }

    case 'io_error':
      return [{ severity: 'error', code: FlowValidationCode.Io, message: error.message }];

    case 'not_found':
      return [
        {
          severity: 'error',
          code: FlowValidationCode.NotFound,
          message: `Flow not found: ${error.flowId}`,
        },
      ];

    default: {
      const exhaustive: never = error;
      throw new Error(`Unhandled FlowStoreError variant: ${JSON.stringify(exhaustive)}`);
    }
  }
}
