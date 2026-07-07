import { FlowValidationCode } from '../validation/codes';
import type { FlowValidationIssue } from '../validation/types';
import { wrapSaveExceptionIssues } from './wrap_save_exception_issues';

const schemaIssue: FlowValidationIssue = {
  severity: 'error',
  code: FlowValidationCode.Schema,
  message: 'At least one component is required',
  fieldPath: 'components',
};

const semanticIssue: FlowValidationIssue = {
  severity: 'error',
  code: FlowValidationCode.Semantic,
  message: 'Entry point "ghost" not found in components',
};

describe('wrapSaveExceptionIssues', () => {
  it('passes validation issues (schema, semantic) through unchanged', () => {
    const result = wrapSaveExceptionIssues([schemaIssue, semanticIssue]);
    expect(result).toEqual([schemaIssue, semanticIssue]);
  });

  it.each([FlowValidationCode.Io, FlowValidationCode.Format, FlowValidationCode.Conversion])(
    'wraps exception issues (code %s) with generic message and moves original message into details',
    (code) => {
      const result = wrapSaveExceptionIssues([
        {
          severity: 'error',
          code,
          message: 'Failed to write flow file: ENOENT',
        },
      ]);

      expect(result).toEqual([
        {
          severity: 'error',
          code,
          message: "Couldn't save this flow",
          details: 'Failed to write flow file: ENOENT',
        },
      ]);
    },
  );

  it('preserves pre-existing details by concatenating message and details', () => {
    const result = wrapSaveExceptionIssues([
      {
        severity: 'error',
        code: FlowValidationCode.Conversion,
        message: 'Failed to convert Flow to v1',
        details: 'undefined is not iterable',
      },
    ]);

    expect(result).toEqual([
      {
        severity: 'error',
        code: FlowValidationCode.Conversion,
        message: "Couldn't save this flow",
        details: 'Failed to convert Flow to v1: undefined is not iterable',
      },
    ]);
  });

  it('wraps only exception entries in a mixed array', () => {
    const ioIssue: FlowValidationIssue = {
      severity: 'error',
      code: FlowValidationCode.Io,
      message: 'Failed to write flow file: EACCES',
    };

    const result = wrapSaveExceptionIssues([schemaIssue, ioIssue]);

    expect(result).toEqual([
      schemaIssue,
      {
        severity: 'error',
        code: FlowValidationCode.Io,
        message: "Couldn't save this flow",
        details: 'Failed to write flow file: EACCES',
      },
    ]);
  });

  it('returns an empty array unchanged', () => {
    expect(wrapSaveExceptionIssues([])).toEqual([]);
  });

  it('uses a caller-supplied generic message when provided', () => {
    const result = wrapSaveExceptionIssues(
      [
        {
          severity: 'error',
          code: FlowValidationCode.Io,
          message: 'Failed to write catalog flow file: EACCES',
        },
      ],
      "Couldn't create this catalog flow",
    );

    expect(result).toEqual([
      {
        severity: 'error',
        code: FlowValidationCode.Io,
        message: "Couldn't create this catalog flow",
        details: 'Failed to write catalog flow file: EACCES',
      },
    ]);
  });
});
