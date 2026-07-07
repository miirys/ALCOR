import type { FlowId } from '../types';
import { flowStoreErrorToIssues } from './map_from_store_error';

describe('flowStoreErrorToIssues', () => {
  it('passes validation_error issues through unchanged', () => {
    const issues = flowStoreErrorToIssues({
      type: 'validation_error',
      issues: [
        { severity: 'error', code: 'flow.schema', message: 'A is required' },
        { severity: 'error', code: 'flow.semantic', message: 'B references C' },
      ],
    });

    expect(issues).toEqual([
      { severity: 'error', code: 'flow.schema', message: 'A is required' },
      { severity: 'error', code: 'flow.semantic', message: 'B references C' },
    ]);
  });

  it('expands invalid_format details into one issue per detail', () => {
    const issues = flowStoreErrorToIssues({
      type: 'invalid_format',
      message: 'Invalid YAML format',
      details: ['unexpected token at line 5', 'missing colon at line 7'],
    });

    expect(issues).toEqual([
      { severity: 'error', code: 'flow.format', message: 'unexpected token at line 5' },
      { severity: 'error', code: 'flow.format', message: 'missing colon at line 7' },
    ]);
  });

  it('falls back to message when invalid_format has no details', () => {
    const issues = flowStoreErrorToIssues({
      type: 'invalid_format',
      message: 'Invalid YAML format',
    });

    expect(issues).toEqual([
      { severity: 'error', code: 'flow.format', message: 'Invalid YAML format' },
    ]);
  });

  it('produces a single io_error issue', () => {
    const issues = flowStoreErrorToIssues({
      type: 'io_error',
      message: 'Failed to read flow file: EACCES',
    });

    expect(issues).toEqual([
      { severity: 'error', code: 'flow.io', message: 'Failed to read flow file: EACCES' },
    ]);
  });

  it('produces a not_found issue with the flow id', () => {
    const issues = flowStoreErrorToIssues({
      type: 'not_found',
      flowId: 'flow://default' as FlowId,
    });

    expect(issues).toEqual([
      { severity: 'error', code: 'flow.not_found', message: 'Flow not found: flow://default' },
    ]);
  });
});
