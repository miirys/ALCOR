/**
 * Terminal hyperlink support — OSC 8 escape sequence generation and detection.
 *
 * Replaces `supports-hyperlinks` and `ansi-escapes.link()` with a custom
 * implementation that works inside Ink (where stdout is not a TTY) and
 * detects additional terminals like Kitty.
 */

let cached: boolean | undefined;

/**
 * Detect whether the current terminal supports OSC 8 hyperlinks.
 *
 * Checks environment variables directly — no `isTTY` dependency — so it
 * works correctly when Ink captures stdout.
 */
export function supportsHyperlinks(): boolean {
  if (cached !== undefined) return cached;
  cached = detectHyperlinkSupport();
  return cached;
}

function detectHyperlinkSupport(): boolean {
  const { env } = process;

  // Honor explicit override
  if (env.FORCE_HYPERLINK !== undefined) {
    return !['0', 'false', ''].includes(env.FORCE_HYPERLINK);
  }

  // Terminal multiplexers don't reliably pass OSC 8 through
  if (env.TMUX || env.STY) return false;

  // Windows Terminal
  if (env.WT_SESSION) return true;

  // Terminals identified by TERM_PROGRAM
  const termProgram = (env.TERM_PROGRAM ?? '').toLowerCase();
  const supportedPrograms = ['iterm.app', 'wezterm', 'vscode', 'ghostty', 'hyper'];
  if (supportedPrograms.includes(termProgram)) return true;

  // Kitty
  if (env.KITTY_WINDOW_ID) return true;

  // Alacritty
  if (env.TERM === 'alacritty' || env.ALACRITTY_SOCKET) return true;

  // VTE-based terminals (GNOME Terminal, Tilix, etc.) — VTE >= 0.50.0
  if (env.VTE_VERSION) {
    const version = Number.parseInt(env.VTE_VERSION, 10);
    if (version >= 5000) return true;
  }

  return false;
}

/**
 * Wrap `text` in an OSC 8 hyperlink pointing to `url`.
 *
 * Uses ST (String Terminator: `\x1b\\`) instead of BEL (`\x07`) for
 * better compatibility across terminal multiplexers.
 *
 * Falls back to plain text when hyperlinks aren't supported.
 */
export function hyperlink(text: string, url: string): string {
  if (!supportsHyperlinks()) return text;

  // Strip ESC to prevent OSC 8 escape sequence injection
  const safeUrl = url.replaceAll('\x1b', '');
  const OSC = '\x1b]8;;';
  const ST = '\x1b\\';
  return `${OSC}${safeUrl}${ST}${text}${OSC}${ST}`;
}

/**
 * Reset the cached detection result. Useful for testing.
 * @internal
 */
export function resetHyperlinkCache(): void {
  cached = undefined;
}
