import { describe, it, expect } from '@jest/globals';
import { resolveNotificationTarget } from './notification_target';

describe('resolveNotificationTarget', () => {
  it('maps iTerm2 to OSC 9', () => {
    expect(resolveNotificationTarget({ TERM_PROGRAM: 'iTerm.app' }, 'darwin').kind).toBe('osc9');
  });

  it('maps VS Code to the bell (its terminal ignores OSC notifications)', () => {
    expect(resolveNotificationTarget({ TERM_PROGRAM: 'vscode' }, 'darwin').kind).toBe('bell');
  });

  it('maps Ghostty to OSC 777', () => {
    expect(resolveNotificationTarget({ TERM_PROGRAM: 'ghostty' }, 'linux').kind).toBe('osc777');
  });

  it('maps Apple Terminal to the bell (osascript would open Script Editor on click)', () => {
    expect(resolveNotificationTarget({ TERM_PROGRAM: 'Apple_Terminal' }, 'darwin').kind).toBe(
      'bell',
    );
  });

  it('matches TERM_PROGRAM case-insensitively', () => {
    expect(resolveNotificationTarget({ TERM_PROGRAM: 'GHOSTTY' }, 'darwin').kind).toBe('osc777');
  });

  describe('terminal multiplexers', () => {
    it('returns none under tmux', () => {
      expect(
        resolveNotificationTarget(
          { TMUX: '/tmp/tmux-1000/default,123,0', TERM_PROGRAM: 'iTerm.app' },
          'darwin',
        ).kind,
      ).toBe('none');
    });

    it('returns none under screen', () => {
      expect(
        resolveNotificationTarget({ STY: '1234.pts-0.host', TERM_PROGRAM: 'ghostty' }, 'linux')
          .kind,
      ).toBe('none');
    });
  });

  describe('unknown terminals fall back by platform', () => {
    it('uses the bell on macOS', () => {
      expect(resolveNotificationTarget({}, 'darwin').kind).toBe('bell');
    });

    it('uses notify-send on Linux', () => {
      expect(resolveNotificationTarget({}, 'linux').kind).toBe('notify-send');
    });

    it('uses powershell on Windows', () => {
      expect(resolveNotificationTarget({}, 'win32').kind).toBe('powershell');
    });

    it('returns none on unsupported platforms', () => {
      expect(resolveNotificationTarget({}, 'aix').kind).toBe('none');
    });
  });

  describe('DUO_NOTIFICATIONS_FORCE override', () => {
    it('forces a specific kind', () => {
      expect(
        resolveNotificationTarget(
          { DUO_NOTIFICATIONS_FORCE: 'osc777', TERM_PROGRAM: 'iTerm.app' },
          'darwin',
        ).kind,
      ).toBe('osc777');
    });

    it('disables notifications when set to a falsy value', () => {
      expect(
        resolveNotificationTarget(
          { DUO_NOTIFICATIONS_FORCE: '0', TERM_PROGRAM: 'iTerm.app' },
          'darwin',
        ).kind,
      ).toBe('none');
    });

    it('ignores an unrecognised value and continues detection', () => {
      expect(
        resolveNotificationTarget(
          { DUO_NOTIFICATIONS_FORCE: 'bogus', TERM_PROGRAM: 'iTerm.app' },
          'darwin',
        ).kind,
      ).toBe('osc9');
    });
  });
});
