import { setFlags, parseFlags, queryFlags } from './kitty-protocol';

export function detectTerminal() {
  const termProgram = process.env.TERM_PROGRAM;
  const term = process.env.TERM;

  if (termProgram) return termProgram;
  if (process.env.KITTY_WINDOW_ID) return 'Kitty';
  if (process.env.ALACRITTY_SOCKET) return 'Alacritty';
  if (process.env.GNOME_TERMINAL_SCREEN) return 'GnomeTerminal';
  if (term?.includes('kitty')) return 'Kitty';

  // Windows terminals rarely set TERM_PROGRAM, so fall back to their own markers.
  // Windows Terminal sets WT_SESSION (and WT_PROFILE_ID).
  if (process.env.WT_SESSION || process.env.WT_PROFILE_ID) return 'WindowsTerminal';
  // ConEmu / Cmder expose ConEmuPID and ConEmuANSI.
  if (process.env.ConEmuPID || process.env.ConEmuANSI) return 'ConEmu';

  return 'Unknown';
}

/**
 * Detects the user's shell from the SHELL environment variable.
 * Returns just the shell name (e.g., 'zsh', 'bash') without the path.
 * Returns undefined if SHELL is not set.
 */
export function detectShell(): string | undefined {
  const shellPath = process.env.SHELL;
  if (!shellPath) {
    return undefined;
  }

  // Extract just the shell name from the path (e.g., '/bin/zsh' -> 'zsh')
  const parts = shellPath.split('/');
  return parts[parts.length - 1];
}

export async function isKittyProtocolSupported(): Promise<boolean> {
  // If stdin is not a TTY, Kitty protocol is not supported
  if (!process.stdin.isTTY) {
    return Promise.resolve(false);
  }

  // No Windows console host implements the Kitty keyboard protocol.
  if (process.platform === 'win32') {
    return Promise.resolve(false);
  }

  return new Promise((resolve) => {
    const { stdin, stdout } = process;

    stdin.setRawMode(true);

    const cleanup = () => {
      clearTimeout(timeout);
      stdout.write(setFlags({}));
      stdin.setRawMode(false);
      stdin.off('data', onData);
    };

    const timeout = setTimeout(() => {
      cleanup();
      resolve(false);
    }, 100);

    const onData = (data: Buffer<ArrayBufferLike>) => {
      // Look for Kitty protocol response pattern
      const flags = parseFlags(data);

      if (flags?.disambiguate) {
        cleanup();
        resolve(true);
      }
    };

    stdin.on('data', onData);

    // Try to push progressive enhancement mode and query
    // stdout.write('\x1b[>1u'); // Enable disambiguate escape codes
    stdout.write(setFlags({ disambiguate: true }));
    stdout.write(queryFlags); // Query current mode
  });
}
