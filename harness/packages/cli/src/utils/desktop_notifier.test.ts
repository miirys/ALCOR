import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { TestLogger } from '@gitlab-org/logging';

const mockSpawn = jest.fn();
jest.unstable_mockModule('node:child_process', () => ({
  spawn: mockSpawn,
}));

const { DesktopNotifier } = await import('./desktop_notifier');

describe('DesktopNotifier', () => {
  let written: string[];
  let notifier: InstanceType<typeof DesktopNotifier>;

  beforeEach(() => {
    mockSpawn.mockReset();
    mockSpawn.mockReturnValue({ unref: jest.fn(), on: jest.fn() });
    written = [];
    notifier = new DesktopNotifier(new TestLogger(), 'darwin', (seq) => written.push(seq));
  });

  it('writes an OSC 9 sequence for the osc9 target', () => {
    notifier.notify({ kind: 'osc9' }, { title: 'GitLab Duo', body: 'Response ready' });
    expect(written).toEqual(['\x1b]9;GitLab Duo: Response ready\x07']);
    expect(mockSpawn).not.toHaveBeenCalled();
  });

  it('writes an OSC 777 sequence for the osc777 target', () => {
    notifier.notify({ kind: 'osc777' }, { title: 'GitLab Duo', body: 'Approval needed' });
    expect(written).toEqual(['\x1b]777;notify;GitLab Duo;Approval needed\x07']);
  });

  it('strips control characters from the message to prevent escape injection', () => {
    notifier.notify({ kind: 'osc9' }, { title: 'GitLab Duo', body: 'evil\x1b]0;pwn\x07end' });
    // ESC and BEL are removed, so the remaining "]0;" is harmless literal text.
    expect(written[0]).toBe('\x1b]9;GitLab Duo: evil ]0;pwn end\x07');
    expect(written[0]).not.toContain('\x1b]0;');
  });

  it('writes the terminal bell for the bell target (no Script Editor)', () => {
    notifier.notify({ kind: 'bell' }, { title: 'GitLab Duo', body: 'Response ready' });
    expect(written).toEqual(['\x07']);
    expect(mockSpawn).not.toHaveBeenCalled();
  });

  it('spawns notify-send for the notify-send target', () => {
    notifier.notify({ kind: 'notify-send' }, { title: 'GitLab Duo', body: 'Response ready' });
    expect(written).toEqual([]);
    expect(mockSpawn).toHaveBeenCalledWith(
      'notify-send',
      ['--app-name=GitLab Duo', 'GitLab Duo', 'Response ready'],
      expect.objectContaining({ detached: true }),
    );
  });

  it('does nothing for the none target', () => {
    notifier.notify({ kind: 'none' }, { title: 'GitLab Duo', body: 'x' });
    expect(written).toEqual([]);
    expect(mockSpawn).not.toHaveBeenCalled();
  });
});
