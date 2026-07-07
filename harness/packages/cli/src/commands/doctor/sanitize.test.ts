import { describe, expect, it, jest } from '@jest/globals';
import { createFakePartial } from '@gitlab-org/test-utils';
import { SecretRedactor } from '@gitlab-org/secret-redaction';
import { sanitizeForReport } from './sanitize';

describe('sanitizeForReport', () => {
  const passthroughRedactor = createFakePartial<SecretRedactor>({
    redactSecrets: jest.fn<SecretRedactor['redactSecrets']>().mockImplementation((raw) => raw),
  });

  it.each([
    ['/Users/malte/foo/bar.ts', '/Users/[user]/foo/bar.ts'],
    ['cwd: /home/alice/repo', 'cwd: /home/[user]/repo'],
    ['C:\\Users\\bob\\Projects\\repo', 'C:\\Users\\[user]\\Projects\\repo'],
  ])('redacts home path username: %s → %s', (input, expected) => {
    expect(sanitizeForReport(input, passthroughRedactor)).toBe(expected);
  });

  it('redacts URL credentials', () => {
    const out = sanitizeForReport(
      'proxy: http://alice:secretpw@proxy.local:3128',
      passthroughRedactor,
    );
    expect(out).toContain('proxy.local:3128');
    expect(out).not.toContain('secretpw');
  });

  it('forwards the result to SecretRedactor for the final pass', () => {
    const redactor = createFakePartial<SecretRedactor>({
      redactSecrets: jest
        .fn<SecretRedactor['redactSecrets']>()
        .mockImplementation((raw) => raw.replace('TOP_SECRET', '[redacted]')),
    });

    expect(sanitizeForReport('value: TOP_SECRET', redactor)).toBe('value: [redacted]');
  });
});
