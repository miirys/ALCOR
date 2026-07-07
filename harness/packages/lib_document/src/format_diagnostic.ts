import { Diagnostic } from 'vscode-languageserver-protocol';

export function formatDiagnostic(diagnostic: Diagnostic): string {
  const range = `[${diagnostic.range.start.line}:${diagnostic.range.start.character} - ${diagnostic.range.end.line}:${diagnostic.range.end.character}]`;

  const source = diagnostic.source ? `source: "${diagnostic.source}"` : undefined;
  const code = diagnostic.code ? `code: "${diagnostic.code}"` : undefined;
  const details = [source, code].filter(Boolean);
  const additionalDetails = details.length ? ` (${details.join(', ')})` : '';

  return `${diagnostic.severity}: ${diagnostic.message} ${range}${additionalDetails}`;
}
