import { ConversionError } from '../persistence/resolver/errors';
import { conversionErrorToIssues } from './conversion_error_to_issues';

describe('conversionErrorToIssues', () => {
  it('passes schema_validation issues through unchanged', () => {
    const issues = conversionErrorToIssues(
      ConversionError.schemaValidation('Generated v1 flow is invalid', [
        {
          severity: 'error',
          code: 'flow.schema',
          message: 'At least one component is required',
          fieldPath: 'components',
        },
      ]),
    );

    expect(issues).toEqual([
      {
        severity: 'error',
        code: 'flow.schema',
        message: 'At least one component is required',
        fieldPath: 'components',
      },
    ]);
  });

  it('emits one semantic issue per error string', () => {
    const issues = conversionErrorToIssues(
      ConversionError.semanticValidation('Flow has semantic validation errors', [
        'Entry point "ghost" not found in components',
      ]),
    );

    expect(issues).toEqual([
      {
        severity: 'error',
        code: 'flow.semantic',
        message: 'Entry point "ghost" not found in components',
      },
    ]);
  });

  it('wraps conversion_failed with neutral message and pulls inner Error.message into details', () => {
    const issues = conversionErrorToIssues(
      ConversionError.conversionFailed('Failed to convert Flow to v1', new Error('boom')),
    );

    expect(issues).toEqual([
      {
        severity: 'error',
        code: 'flow.conversion',
        message: 'Failed to convert Flow to v1',
        details: 'boom',
      },
    ]);
  });

  it('omits details when conversion_failed cause is not an Error instance', () => {
    const issues = conversionErrorToIssues(
      ConversionError.conversionFailed('Failed to convert Flow to v1', 'not-an-error'),
    );

    expect(issues).toEqual([
      {
        severity: 'error',
        code: 'flow.conversion',
        message: 'Failed to convert Flow to v1',
      },
    ]);
  });
});
