/**
 * Resolves how a system notification should be delivered for the current terminal.
 *
 * Mirrors the detection approach in `packages/tui/src/lib/hyperlinks.ts`: inspect environment
 * variables (no `isTTY` dependency, so it works while Ink owns stdout) and bail out under
 * terminal multiplexers, where focus reporting and OSC passthrough are unreliable.
 *
 * Preferred delivery is a terminal-native OSC escape (OSC 9 / OSC 777): the terminal emulator
 * raises the OS notification, plays its sound, and clicking it focuses that terminal — and it
 * works over SSH.
 *
 * macOS has no dependency-free way to post a banner owned by the terminal: an `osascript`
 * notification is owned by Script Editor, so clicking it opens Script Editor (and there is no
 * way to change the owner or disable the click). So Apple Terminal and unknown macOS terminals
 * fall back to the terminal bell, which the terminal itself handles (audible, click-safe).
 */

export type NotificationTargetKind =
  | 'osc9'
  | 'osc777'
  | 'bell'
  | 'notify-send'
  | 'powershell'
  | 'none';

export interface NotificationTarget {
  kind: NotificationTargetKind;
}

const VALID_KINDS: readonly NotificationTargetKind[] = [
  'osc9',
  'osc777',
  'bell',
  'notify-send',
  'powershell',
  'none',
];

/** Best-effort delivery for terminals we don't recognise, based on the OS. */
function platformFallback(platform: NodeJS.Platform): NotificationTargetKind {
  switch (platform) {
    case 'darwin':
      // osascript notifications open Script Editor on click — use the terminal bell instead.
      return 'bell';
    case 'linux':
      return 'notify-send';
    case 'win32':
      return 'powershell';
    default:
      return 'none';
  }
}

/**
 * Decide the notification delivery target from the environment.
 *
 * @param env Environment to inspect (defaults to `process.env`).
 * @param platform OS platform (defaults to `process.platform`).
 */
export function resolveNotificationTarget(
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
): NotificationTarget {
  // Test/override hook (cf. FORCE_HYPERLINK). Accepts a kind, or a falsy value to disable.
  const force = env.DUO_NOTIFICATIONS_FORCE;
  if (force !== undefined) {
    if (['0', 'false', ''].includes(force)) return { kind: 'none' };
    if ((VALID_KINDS as string[]).includes(force)) return { kind: force as NotificationTargetKind };
  }

  // Terminal multiplexers don't reliably report focus or pass OSC through — stay silent.
  if (env.TMUX || env.STY) return { kind: 'none' };

  const termProgram = (env.TERM_PROGRAM ?? '').toLowerCase();
  switch (termProgram) {
    case 'iterm.app':
      return { kind: 'osc9' };
    case 'vscode':
      // VS Code's integrated terminal (xterm.js) ignores OSC 9/777 notifications and exposes no
      // escape that raises an OS notification — fall back to the bell, which VS Code surfaces as
      // a terminal-tab indicator / audio cue (subject to the user's bell settings).
      return { kind: 'bell' };
    case 'ghostty':
      return { kind: 'osc777' };
    case 'apple_terminal':
      // Apple Terminal has no native OSC notification, and osascript opens Script Editor on
      // click — use the terminal bell, which Terminal.app handles itself (audible, click-safe).
      return { kind: 'bell' };
    default:
      return { kind: platformFallback(platform) };
  }
}
