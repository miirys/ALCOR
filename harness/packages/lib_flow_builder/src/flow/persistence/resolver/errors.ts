import type { FlowValidationIssue } from '../../validation/types';

export type ConversionError =
  | { type: 'schema_validation'; message: string; issues: FlowValidationIssue[] }
  | { type: 'semantic_validation'; message: string; errors: string[] }
  | { type: 'conversion_failed'; message: string; cause?: unknown };

export const ConversionError = {
  schemaValidation: (message: string, issues: FlowValidationIssue[]): ConversionError => ({
    type: 'schema_validation',
    message,
    issues,
  }),

  semanticValidation: (message: string, errors: string[]): ConversionError => ({
    type: 'semantic_validation',
    message,
    errors,
  }),

  conversionFailed: (message: string, cause?: unknown): ConversionError => ({
    type: 'conversion_failed',
    message,
    cause,
  }),
};
