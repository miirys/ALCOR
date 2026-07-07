// Provider SDK is ESM-only; factory-mock it at module level (project convention).
import { SandboxManager } from '@anthropic-ai/sandbox-runtime';
import { DesktopSandboxViolations } from './desktop_sandbox_violations';

jest.mock('@anthropic-ai/sandbox-runtime', () => ({
  SandboxManager: {
    getSandboxViolationStore: jest.fn(),
  },
}));

const mockedGetStore = jest.mocked(SandboxManager.getSandboxViolationStore);

const stubStoreReturning = (
  violations: readonly { line: string; timestamp: Date }[],
  forCommand?: { command: string; violations: readonly { line: string; timestamp: Date }[] },
) => {
  mockedGetStore.mockReturnValue({
    getViolations: () => violations as never,
    getViolationsForCommand: (cmd: string) =>
      (forCommand && forCommand.command === cmd ? forCommand.violations : []) as never,
  } as never);
};

describe('DesktopSandboxViolations', () => {
  it('getSince returns violations with timestamp >= startMs, mapped to the provider-agnostic shape', () => {
    const startMs = new Date('2026-05-22T20:00:00Z').getTime();
    const before = new Date('2026-05-22T19:59:59Z');
    const after = new Date('2026-05-22T20:00:05Z');

    stubStoreReturning([
      { line: 'file-read-data /home/before', timestamp: before },
      { line: 'file-read-data /home/after', timestamp: after },
    ]);

    const subject = new DesktopSandboxViolations();

    expect(subject.getSince(startMs)).toEqual([
      { description: 'file-read-data /home/after', timestamp: after },
    ]);
  });

  it('getSince returns empty when the provider store is empty', () => {
    stubStoreReturning([]);
    const subject = new DesktopSandboxViolations();
    expect(subject.getSince(Date.now())).toEqual([]);
  });

  it('getForCommandSince scopes to the provider violations matching that command', () => {
    const startMs = new Date('2026-05-22T20:00:00Z').getTime();
    const after = new Date('2026-05-22T20:00:05Z');

    stubStoreReturning([{ line: 'unrelated', timestamp: new Date('2026-05-22T20:00:01Z') }], {
      command: 'worker-cmd',
      violations: [{ line: 'file-read-data /home/x', timestamp: after }],
    });

    const subject = new DesktopSandboxViolations();

    expect(subject.getForCommandSince('worker-cmd', startMs)).toEqual([
      { description: 'file-read-data /home/x', timestamp: after },
    ]);
    expect(subject.getForCommandSince('different-cmd', startMs)).toEqual([]);
  });
});
