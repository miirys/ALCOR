import type { ConversionError } from '../persistence/resolver/errors';
import { FlowValidationCode } from './codes';
import type { FlowValidationIssue } from './types';

/**
 * Translate a {@link ConversionError} produced by a flow resolver into the
 * unified {@link FlowValidationIssue} shape.
 *
 * The schema-validation case is a passthrough: the v1 converter already
 * produced node-routed issues with field paths in internal vocabulary
 * (see `zod_issue_mapper.ts`). Semantic validation stays flat (one issue
 * per error string). Unexpected exceptions are wrapped: `message` carries
 * the neutral wrapper string from `ConversionError.conversionFailed`, and
 * `details` carries the inner `Error.message` for diagnosis — never a
 * stack trace.
 */
export function conversionErrorToIssues(error: ConversionError): FlowValidationIssue[] {
  switch (error.type) {
    case 'schema_validation':
      return error.issues;

    case 'semantic_validation':
      return error.errors.map((message) => ({
        severity: 'error' as const,
        code: FlowValidationCode.Semantic,
        message,
      }));

    case 'conversion_failed': {
      const details = error.cause instanceof Error ? error.cause.message : undefined;
      return [
        {
          severity: 'error',
          code: FlowValidationCode.Conversion,
          message: error.message,
          ...(details ? { details } : {}),
        },
      ];
    }

    default: {
      const exhaustive: never = error;
      throw new Error(`Unhandled ConversionError variant: ${JSON.stringify(exhaustive)}`);
    }
  }
}
