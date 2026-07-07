import { TestLogger } from '@gitlab-org/logging';
import { createFakePartial } from '@gitlab-org/test-utils';
import { renderSandboxViolation, renderViolation } from './render';
import type { SandboxViolations } from './sandbox_violations';

describe('renderSandboxViolation', () => {
  it('returns the locked one-line message with no resource detail', () => {
    expect(renderSandboxViolation()).toBe('Operation is blocked by sandbox.');
  });
});

describe('renderViolation', () => {
  const startMs = new Date('2026-05-22T20:00:00Z').getTime();
  let logger: TestLogger;

  beforeEach(() => {
    logger = new TestLogger();
  });

  it('rewrites when the violation resource appears in the original error', () => {
    const violations = createFakePartial<SandboxViolations>({
      getSince: jest
        .fn()
        .mockReturnValue([
          { description: 'file-read-data /Users/karlj/.ssh/id_rsa', timestamp: new Date(1000) },
        ]),
    });

    const original = 'Error reading file: EACCES /Users/karlj/.ssh/id_rsa';
    expect(renderViolation(violations, startMs, original, logger)).toBe(
      'Operation is blocked by sandbox.',
    );
  });

  it('does not rewrite when the violation resource is absent from the original error', () => {
    // Regression test for incidental ambient violations (e.g., a worker subprocess hitting
    // sysctl-read during an unrelated read_file ENOENT).
    const violations = createFakePartial<SandboxViolations>({
      getSince: jest.fn().mockReturnValue([
        {
          description: 'git(26369) deny(1) sysctl-read kern.iossupportversion',
          timestamp: new Date(1000),
        },
      ]),
    });

    const original = 'File not found: "~/Downloads/anything.txt"';
    expect(renderViolation(violations, startMs, original, logger)).toBeUndefined();
  });

  it('picks the latest timestamp regardless of the provider ordering', () => {
    const violations = createFakePartial<SandboxViolations>({
      getSince: jest.fn().mockReturnValue([
        { description: 'file-read-data /tmp/late', timestamp: new Date(1000) },
        { description: 'file-read-data /tmp/early', timestamp: new Date(0) },
        { description: 'file-read-data /tmp/middle', timestamp: new Date(500) },
      ]),
    });

    expect(renderViolation(violations, startMs, 'EACCES /tmp/late', logger)).toBe(
      'Operation is blocked by sandbox.',
    );
  });

  it('walks past a later unrelated violation to a matching earlier one', () => {
    // The kernel may log unrelated ambient violations after the action's own deny.
    // Iterating newest-first avoids missing the action's violation just because something
    // else landed last.
    const violations = createFakePartial<SandboxViolations>({
      getSince: jest.fn().mockReturnValue([
        { description: 'file-read-data /tmp/match', timestamp: new Date(1000) },
        {
          description: 'git(35838) deny(1) sysctl-read kern.iossupportversion',
          timestamp: new Date(2000),
        },
      ]),
    });

    expect(renderViolation(violations, startMs, 'EACCES /tmp/match', logger)).toBe(
      'Operation is blocked by sandbox.',
    );
  });

  it('does not rewrite when a violation resource is a prefix of an unrelated path in the error', () => {
    // Substring matches would have false-positived "/tmp/x" against "/tmp/xyz".
    // The boundary check requires a non-path character (or end-of-string) after the resource.
    const violations = createFakePartial<SandboxViolations>({
      getSince: jest
        .fn()
        .mockReturnValue([{ description: 'file-read-data /tmp/x', timestamp: new Date(1000) }]),
    });

    expect(renderViolation(violations, startMs, 'EACCES /tmp/xyz', logger)).toBeUndefined();
  });

  it('returns undefined when no violation landed', () => {
    const violations = createFakePartial<SandboxViolations>({
      getSince: jest.fn().mockReturnValue([]),
    });

    expect(renderViolation(violations, startMs, 'original err', logger)).toBeUndefined();
  });

  it('swallows errors from the violations service so the caller keeps the original error', () => {
    const violations = createFakePartial<SandboxViolations>({
      getSince: jest.fn().mockImplementation(() => {
        throw new Error('sandbox provider degraded');
      }),
    });

    expect(renderViolation(violations, startMs, 'original err', logger)).toBeUndefined();
  });

  it('uses getForCommandSince when a command is provided', () => {
    const violations = createFakePartial<SandboxViolations>({
      getSince: jest.fn(),
      getForCommandSince: jest
        .fn()
        .mockReturnValue([{ description: 'file-read-data /home/x', timestamp: new Date(1000) }]),
    });

    expect(renderViolation(violations, startMs, 'EACCES /home/x', logger, 'worker-cmd')).toBe(
      'Operation is blocked by sandbox.',
    );
    expect(violations.getForCommandSince).toHaveBeenCalledWith('worker-cmd', startMs);
    expect(violations.getSince).not.toHaveBeenCalled();
  });
});
