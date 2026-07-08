import { setFlags } from './kitty-protocol';
import { BRACKETED_PASTE_OFF, BRACKETED_PASTE_ON, kittyResetSequences } from './tty_state';
import { replayCurrentFrame } from './ink_internals';

export interface TerminalModeOptions {
  /** Whether the kitty keyboard protocol was enabled on startup. */
  isKittySupported: boolean;
}

/** Options for {@link withSuspendedTty}; the shape matches {@link TerminalModeOptions}. */
export type SuspendTtyOptions = TerminalModeOptions;

type RevertFn = () => void;

const write = (sequence: string | Uint8Array) => process.stdout.write(sequence);

/**
 * A single TTY mode the TUI owns: how to enter it, how to leave it, and whether it
 * participates when the terminal is handed to a blocking child process.
 *
 * This list is the single source of truth for "what are the TUI's TTY modes". Both
 * {@link enterTerminalModes} (full lifecycle) and {@link withSuspendedTty} (lighter
 * child-process boundary) derive their behaviour from it, so a mode added or reordered
 * here can't drift between the Ctrl+Z-suspend and editor-suspend paths. The paths are
 * deliberately not identical: each selects modes via the `suspendable` and
 * `restoreAfterSuspend` flags (e.g. kitty is torn down for a child but not re-pushed on
 * restore), so those flags — not matching prose — are where any divergence belongs.
 */
interface TtyMode {
  /** Enter the mode. */
  apply: () => void;
  /** Leave the mode (the inverse of `apply`). */
  revert: () => void;
  /** Only meaningful on an interactive stdin (raw mode, kitty protocol). */
  ttyOnly: boolean;
  /** Tear this mode down while a blocking child process holds the terminal. */
  suspendable: boolean;
  /**
   * Re-enter this mode after the child exits. The kitty protocol opts out: Ink
   * re-pushes its flags on the next render, and writing them here too risks a
   * double-write race.
   */
  restoreAfterSuspend: boolean;
}

const ttyModes = ({ isKittySupported }: TerminalModeOptions): TtyMode[] => {
  const modes: TtyMode[] = [
    {
      // Alternate screen buffer: ALCOR renders a full-screen session, not a
      // scroll log. First in the list so it is entered before anything draws
      // and left last on teardown, restoring the user's scrollback intact.
      apply: () => write('\x1b[?1049h\x1b[2J\x1b[H'),
      revert: () => write('\x1b[?1049l'),
      ttyOnly: true,
      // Torn down for a child process / Ctrl+Z so the user gets their normal
      // screen back, and re-entered on resume.
      suspendable: true,
      restoreAfterSuspend: true,
    },
    {
      // Save the current window title to the xterm title stack, then set ours.
      apply: () => {
        write('\x1b[22;2t');
        write('\x1b]0;ALCOR\x07');
      },
      revert: () => write('\x1b[23;2t'),
      ttyOnly: false,
      // A stale title is harmless to a child process and is restored on resume anyway,
      // so it stays out of the suspend boundary.
      suspendable: false,
      restoreAfterSuspend: false,
    },
    {
      apply: () => write(BRACKETED_PASTE_ON),
      revert: () => write(BRACKETED_PASTE_OFF),
      ttyOnly: false,
      suspendable: true,
      restoreAfterSuspend: true,
    },
    {
      // Terminal focus reporting (DEC mode ?1004) so notifications can be suppressed while
      // the terminal is unfocused. Torn down for a child because editors that don't consume
      // focus events (e.g. nano) would otherwise receive stray ESC[I / ESC[O on focus change.
      apply: () => write('\x1b[?1004h'),
      revert: () => write('\x1b[?1004l'),
      ttyOnly: false,
      suspendable: true,
      restoreAfterSuspend: true,
    },
    {
      // Hide the hardware cursor; the TUI draws its own cursor in the input box. We assert this
      // directly rather than relying on Ink because Ink hides the cursor only once and then
      // believes it stays hidden — on resume a sibling instance's exit may have shown it again,
      // and Ink would not re-hide it. Torn down (shown) for a child because editors that don't
      // assert cursor visibility (e.g. nano) would otherwise edit with an invisible cursor.
      apply: () => write('\x1b[?25l'),
      revert: () => write('\x1b[?25h'),
      ttyOnly: false,
      suspendable: true,
      restoreAfterSuspend: true,
    },
    {
      // Raw mode is required for character-by-character input; without it stdin is line-buffered.
      apply: () => process.stdin.setRawMode(true),
      revert: () => process.stdin.setRawMode(false),
      ttyOnly: true,
      suspendable: true,
      restoreAfterSuspend: true,
    },
  ];

  if (isKittySupported) {
    modes.push({
      apply: () =>
        write(setFlags({ disambiguate: true, events: true, alternates: true, text: true })),
      revert: () => kittyResetSequences().forEach(write),
      ttyOnly: true,
      suspendable: true,
      restoreAfterSuspend: false,
    });
  }

  return modes;
};

/**
 * Apply the TUI's TTY modes and return a function that reverts them in reverse order.
 *
 * The reverse-order teardown preserves the ordering constraints baked into the list, notably
 * that the kitty reset runs before raw mode is disabled.
 */
export const enterTerminalModes = (options: TerminalModeOptions): RevertFn => {
  const { isTTY } = process.stdin;
  const applied: TtyMode[] = [];

  for (const mode of ttyModes(options)) {
    if (!mode.ttyOnly || isTTY) {
      mode.apply();
      applied.push(mode);
    }
  }

  return () => {
    for (let i = applied.length - 1; i >= 0; i -= 1) {
      applied[i].revert();
    }
  };
};

/**
 * Run `fn` with the TUI's TTY modes torn down, restoring them afterwards, so a
 * blocking child process (e.g. an external editor) inherits a clean terminal.
 *
 * Only the `suspendable` subset of {@link ttyModes} is torn down, and the kitty protocol is
 * not re-pushed on the way back (Ink does that on its next render). Teardown runs in reverse
 * order so the kitty reset precedes disabling raw mode, matching {@link enterTerminalModes}.
 * On a non-TTY stdio pair this is a passthrough.
 */
export const withSuspendedTty = <T>(fn: () => T, options: SuspendTtyOptions): T => {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    return fn();
  }

  const suspendable = ttyModes(options).filter((mode) => mode.suspendable);

  for (let i = suspendable.length - 1; i >= 0; i -= 1) {
    suspendable[i].revert();
  }

  try {
    return fn();
  } finally {
    for (const mode of suspendable) {
      if (mode.restoreAfterSuspend) {
        mode.apply();
      }
    }
  }
};

export interface SuspendControllerOptions extends TerminalModeOptions {
  /** Send a signal to a pid (or, for pid 0, the caller's process group). Injectable for tests. */
  kill?: (pid: number, signal: NodeJS.Signals) => void;
  /** Repaint the screen after resume. Injectable for tests. */
  replay?: () => void;
  /** Host platform; suspend is a no-op off Unix. Injectable for tests. */
  platform?: NodeJS.Platform;
}

export interface SuspendController {
  /** Restore the terminal to a sane state and suspend the process with SIGTSTP. */
  suspend: () => void;
  /** Re-apply the TUI's terminal modes and repaint after the process is resumed via SIGCONT. */
  resume: () => void;
  /** Revert the terminal modes for good (full shutdown). */
  cleanup: () => void;
}

/**
 * Apply the TUI's terminal modes and coordinate Ctrl+Z suspend and `fg` resume by tearing them
 * down before raising SIGTSTP and re-applying them on resume. The modes are applied immediately
 * so this owns terminal setup for the lifetime of the TUI.
 */
export const createSuspendController = ({
  isKittySupported,
  kill = (pid, signal) => process.kill(pid, signal),
  replay = replayCurrentFrame,
  platform = process.platform,
}: SuspendControllerOptions): SuspendController => {
  let isSuspended = false;
  let revert = enterTerminalModes({ isKittySupported });

  const suspend = () => {
    // Suspend is only meaningful for an interactive Unix TTY; otherwise it is a no-op and the
    // terminal modes applied at construction are torn down only by cleanup() on exit.
    if (isSuspended || !process.stdin.isTTY || platform === 'win32') {
      return;
    }
    isSuspended = true;
    revert();
    kill(0, 'SIGTSTP');
  };

  const resume = () => {
    if (!isSuspended) {
      return;
    }
    isSuspended = false;
    revert = enterTerminalModes({ isKittySupported });
    replay();
  };

  const cleanup = () => {
    // When suspended, suspend() already reverted the modes; reverting again would double-write
    // the off-sequences and pop the title stack twice.
    if (!isSuspended) {
      revert();
    }
  };

  return { suspend, resume, cleanup };
};
