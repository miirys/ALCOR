/**
 * Status badges used in diagnostic rows. Square brackets so they survive
 * unstyled rendering in plain-text output.
 */
export const STATUS = {
  pass: '[✓]',
  fail: '[✗]',
  unknown: '[?]',
  valid: '[valid]',
  invalid: '[invalid]',
  unauthenticated: '[unauthenticated]',
} as const;

export const NOT_AVAILABLE = 'Not available';

export function joinSections(sections: readonly (string | undefined | null)[]): string {
  return sections.filter((s): s is string => Boolean(s && s.trim())).join('\n\n');
}
