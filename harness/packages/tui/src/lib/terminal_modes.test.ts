import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { setFlags } from './kitty-protocol';
import { BRACKETED_PASTE_ON, BRACKETED_PASTE_OFF, kittyResetSequences } from './tty_state';
import { createSuspendController, enterTerminalModes, withSuspendedTty } from './terminal_modes';

const ALT_SCREEN_ON = '\x1b[?1049h\x1b[2J\x1b[H';
const ALT_SCREEN_OFF = '\x1b[?1049l';
const TITLE_PUSH = '\x1b[22;2t';
const TITLE_SET = '\x1b]0;ALCOR\x07';
const TITLE_POP = '\x1b[23;2t';
const FOCUS_ON = '\x1b[?1004h';
const FOCUS_OFF = '\x1b[?1004l';
const CURSOR_HIDE = '\x1b[?25l';
const CURSOR_SHOW = '\x1b[?25h';
const KITTY_ON = new TextDecoder().decode(
  setFlags({ disambiguate: true, events: true, alternates: true, text: true }),
);

interface FakeStdin {
  isTTY?: boolean;
  isRaw?: boolean;
}

describe('terminal_modes', () => {
  let writes: string[];
  let events: string[];
  let setRawMode: jest.Mock<(mode: boolean) => void>;
  const originalStdin = Object.getOwnPropertyDescriptor(process, 'stdin');
  const originalStdout = Object.getOwnPropertyDescriptor(process, 'stdout');

  const installStreams = (stdin: FakeStdin) => {
    Object.defineProperty(process, 'stdin', {
      value: { ...stdin, setRawMode },
      configurable: true,
    });
    Object.defineProperty(process, 'stdout', {
      value: {
        isTTY: stdin.isTTY,
        write: (chunk: string | Uint8Array) => {
          const text = typeof chunk === 'string' ? chunk : new TextDecoder().decode(chunk);
          writes.push(text);
          events.push(`write:${text}`);
        },
      },
      configurable: true,
    });
  };

  beforeEach(() => {
    writes = [];
    events = [];
    setRawMode = jest.fn<(mode: boolean) => void>().mockImplementation((mode) => {
      events.push(`raw:${mode}`);
    });
  });

  afterEach(() => {
    if (originalStdin) Object.defineProperty(process, 'stdin', originalStdin);
    if (originalStdout) Object.defineProperty(process, 'stdout', originalStdout);
  });

  describe('enterTerminalModes', () => {
    describe('when stdin is a TTY with kitty support', () => {
      beforeEach(() => {
        installStreams({ isTTY: true });
      });

      it('writes the enable sequences and turns raw mode on', () => {
        enterTerminalModes({ isKittySupported: true });

        expect(writes).toEqual([
          ALT_SCREEN_ON,
          TITLE_PUSH,
          TITLE_SET,
          BRACKETED_PASTE_ON,
          FOCUS_ON,
          CURSOR_HIDE,
          KITTY_ON,
        ]);
        expect(setRawMode).toHaveBeenCalledWith(true);
      });

      it('reverts in reverse order, resetting kitty before disabling raw mode', () => {
        const revert = enterTerminalModes({ isKittySupported: true });
        events.length = 0;
        writes.length = 0;

        revert();

        const kittyResetEvents = kittyResetSequences().map((sequence) => `write:${sequence}`);
        expect(events).toEqual([
          ...kittyResetEvents,
          'raw:false',
          `write:${CURSOR_SHOW}`,
          `write:${FOCUS_OFF}`,
          `write:${BRACKETED_PASTE_OFF}`,
          `write:${TITLE_POP}`,
          `write:${ALT_SCREEN_OFF}`,
        ]);
      });
    });

    describe('when kitty is not supported', () => {
      beforeEach(() => {
        installStreams({ isTTY: true });
      });

      it('does not write kitty sequences on apply or revert', () => {
        const revert = enterTerminalModes({ isKittySupported: false });
        revert();

        expect(writes).not.toContain(KITTY_ON);
        kittyResetSequences().forEach((sequence) => expect(writes).not.toContain(sequence));
      });
    });

    describe('when stdin is not a TTY', () => {
      beforeEach(() => {
        installStreams({ isTTY: false });
      });

      it('does not touch raw mode or the kitty protocol', () => {
        const revert = enterTerminalModes({ isKittySupported: true });
        revert();

        expect(setRawMode).not.toHaveBeenCalled();
        expect(writes).not.toContain(KITTY_ON);
      });
    });
  });

  describe('withSuspendedTty', () => {
    describe('when stdio is not a TTY', () => {
      beforeEach(() => {
        installStreams({ isTTY: false, isRaw: false });
      });

      it('runs fn without writing any escape sequences', () => {
        const result = withSuspendedTty(() => 'value', { isKittySupported: true });

        expect(result).toBe('value');
        expect(writes).toEqual([]);
        expect(setRawMode).not.toHaveBeenCalled();
      });
    });

    describe('when stdio is a TTY in raw mode', () => {
      beforeEach(() => {
        installStreams({ isTTY: true, isRaw: true });
      });

      it('tears down the suspendable modes before fn and restores them after', () => {
        withSuspendedTty(() => events.push('fn'), { isKittySupported: false });

        expect(events).toEqual([
          'raw:false',
          `write:${CURSOR_SHOW}`,
          `write:${FOCUS_OFF}`,
          `write:${BRACKETED_PASTE_OFF}`,
          `write:${ALT_SCREEN_OFF}`,
          'fn',
          `write:${ALT_SCREEN_ON}`,
          `write:${BRACKETED_PASTE_ON}`,
          `write:${FOCUS_ON}`,
          `write:${CURSOR_HIDE}`,
          'raw:true',
        ]);
      });

      it('resets kitty before disabling raw mode and does not re-push it on restore', () => {
        withSuspendedTty(() => {}, { isKittySupported: true });

        expect(writes).toEqual([
          ...kittyResetSequences(),
          CURSOR_SHOW,
          FOCUS_OFF,
          BRACKETED_PASTE_OFF,
          ALT_SCREEN_OFF,
          ALT_SCREEN_ON,
          BRACKETED_PASTE_ON,
          FOCUS_ON,
          CURSOR_HIDE,
        ]);
        expect(writes).not.toContain(KITTY_ON);
      });

      it('restores TTY state even when fn throws', () => {
        expect(() =>
          withSuspendedTty(
            () => {
              throw new Error('boom');
            },
            { isKittySupported: false },
          ),
        ).toThrow('boom');

        expect(setRawMode).toHaveBeenLastCalledWith(true);
        expect(writes).toContain(BRACKETED_PASTE_ON);
        expect(writes).toContain(FOCUS_ON);
        expect(writes).toContain(CURSOR_HIDE);
      });
    });
  });

  describe('createSuspendController', () => {
    let kill: jest.Mock<(pid: number, signal: NodeJS.Signals) => void>;
    let replay: jest.Mock<() => void>;

    const makeController = (isKittySupported = false, platform: NodeJS.Platform = 'linux') =>
      createSuspendController({ isKittySupported, kill, replay, platform });

    beforeEach(() => {
      kill = jest.fn<(pid: number, signal: NodeJS.Signals) => void>();
      replay = jest.fn<() => void>();
    });

    describe('on a TTY', () => {
      beforeEach(() => {
        installStreams({ isTTY: true });
      });

      it('applies the terminal modes immediately', () => {
        makeController(true);

        expect(setRawMode).toHaveBeenCalledWith(true);
        expect(writes).toContain(FOCUS_ON);
      });

      it('reverts the terminal and stops the process group on suspend', () => {
        const controller = makeController();
        setRawMode.mockClear();

        controller.suspend();

        expect(setRawMode).toHaveBeenCalledWith(false);
        expect(kill).toHaveBeenCalledWith(0, 'SIGTSTP');
      });

      it('is idempotent across repeated suspend calls', () => {
        const controller = makeController();

        controller.suspend();
        controller.suspend();

        expect(kill).toHaveBeenCalledTimes(1);
      });

      it('re-applies modes and repaints on resume', () => {
        const controller = makeController();
        controller.suspend();
        setRawMode.mockClear();

        controller.resume();

        expect(setRawMode).toHaveBeenCalledWith(true);
        expect(replay).toHaveBeenCalledTimes(1);
      });

      it('ignores resume when not suspended', () => {
        const controller = makeController();

        controller.resume();

        expect(replay).not.toHaveBeenCalled();
      });

      it('supports a suspend → resume → suspend cycle', () => {
        const controller = makeController();

        controller.suspend();
        controller.resume();
        controller.suspend();

        expect(kill).toHaveBeenCalledTimes(2);
      });

      it('reverts the terminal on cleanup', () => {
        const controller = makeController();
        setRawMode.mockClear();

        controller.cleanup();

        expect(setRawMode).toHaveBeenCalledWith(false);
        expect(kill).not.toHaveBeenCalled();
      });

      it('does not double-revert on cleanup while suspended', () => {
        const controller = makeController();
        controller.suspend();
        setRawMode.mockClear();

        controller.cleanup();

        expect(setRawMode).not.toHaveBeenCalled();
      });

      it('does not signal on Windows', () => {
        const controller = makeController(false, 'win32');

        controller.suspend();

        expect(kill).not.toHaveBeenCalled();
      });
    });

    describe('when not a TTY', () => {
      beforeEach(() => {
        installStreams({ isTTY: false });
      });

      it('does not suspend the process', () => {
        const controller = makeController();

        controller.suspend();

        expect(kill).not.toHaveBeenCalled();
      });
    });
  });
});
