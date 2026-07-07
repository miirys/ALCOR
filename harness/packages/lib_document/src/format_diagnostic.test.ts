import { Diagnostic, DiagnosticSeverity, Position, Range } from 'vscode-languageserver-protocol';
import { createFakePartial } from '@gitlab-org/test-utils';
import { formatDiagnostic } from './format_diagnostic';

describe('formatDiagnostic', () => {
  const createPosition = (line: number, character: number): Position => ({
    line,
    character,
  });

  const createRange = (
    startLine: number,
    startChar: number,
    endLine: number,
    endChar: number,
  ): Range => ({
    start: createPosition(startLine, startChar),
    end: createPosition(endLine, endChar),
  });

  const createBasicDiagnostic = (overrides: Partial<Diagnostic> = {}): Diagnostic =>
    createFakePartial<Diagnostic>({
      severity: DiagnosticSeverity.Error,
      message: 'Test error message',
      range: createRange(0, 5, 0, 15),
      ...overrides,
    });

  describe('when diagnostic has basic properties only', () => {
    it('should format diagnostic with severity, message, and range', () => {
      const diagnostic = createBasicDiagnostic();

      const result = formatDiagnostic(diagnostic);

      expect(result).toBe('1: Test error message [0:5 - 0:15]');
    });
  });

  describe('when diagnostic has source information', () => {
    it('should include source in formatted output', () => {
      const diagnostic = createBasicDiagnostic({
        source: 'eslint',
      });

      const result = formatDiagnostic(diagnostic);

      expect(result).toBe('1: Test error message [0:5 - 0:15] (source: "eslint")');
    });
  });

  describe('when diagnostic has code information', () => {
    describe('when code is a string', () => {
      it('should include string code in formatted output', () => {
        const diagnostic = createBasicDiagnostic({
          code: 'no-unused-vars',
        });

        const result = formatDiagnostic(diagnostic);

        expect(result).toBe('1: Test error message [0:5 - 0:15] (code: "no-unused-vars")');
      });
    });

    describe('when code is a number', () => {
      it('should include numeric code in formatted output', () => {
        const diagnostic = createBasicDiagnostic({
          code: 2304,
        });

        const result = formatDiagnostic(diagnostic);

        expect(result).toBe('1: Test error message [0:5 - 0:15] (code: "2304")');
      });
    });
  });

  describe('when diagnostic has both source and code', () => {
    it('should include both source and string code in formatted output', () => {
      const diagnostic = createBasicDiagnostic({
        source: 'typescript',
        code: 'TS2304',
      });

      const result = formatDiagnostic(diagnostic);

      expect(result).toBe(
        '1: Test error message [0:5 - 0:15] (source: "typescript", code: "TS2304")',
      );
    });
  });

  describe('when diagnostic has different severity levels', () => {
    it.each([
      { severity: DiagnosticSeverity.Error, expected: '1' },
      { severity: DiagnosticSeverity.Warning, expected: '2' },
      { severity: DiagnosticSeverity.Information, expected: '3' },
      { severity: DiagnosticSeverity.Hint, expected: '4' },
    ])('should format severity $severity as "$expected"', ({ severity, expected }) => {
      const diagnostic = createBasicDiagnostic({ severity });

      const result = formatDiagnostic(diagnostic);

      expect(result).toContain(`${expected}: Test error message`);
    });
  });

  describe('when diagnostic has multi-line ranges', () => {
    it('should format multi-line range correctly', () => {
      const diagnostic = createBasicDiagnostic({
        range: createRange(1, 10, 3, 5),
      });

      const result = formatDiagnostic(diagnostic);

      expect(result).toBe('1: Test error message [1:10 - 3:5]');
    });
  });

  describe('when diagnostic has zero-width ranges', () => {
    it('should format zero-width range correctly', () => {
      const diagnostic = createBasicDiagnostic({
        range: createRange(2, 8, 2, 8),
      });

      const result = formatDiagnostic(diagnostic);

      expect(result).toBe('1: Test error message [2:8 - 2:8]');
    });
  });
});
