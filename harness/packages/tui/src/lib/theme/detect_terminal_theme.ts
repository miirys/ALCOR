import type { Theme } from './use_theme';

const DEFAULT_THEME: Theme = 'dark';

// Response format: ESC]11;rgb:RRRR/GGGG/BBBB (1-4 hex digits per channel)
// eslint-disable-next-line no-control-regex
const OSC_11_RESPONSE = /\x1b\]11;rgba?:([0-9a-f]{1,4})\/([0-9a-f]{1,4})\/([0-9a-f]{1,4})/i;

/** Normalize a variable-length hex channel (1-4 digits) to 0-255. */
function hexTo8bit(hex: string): number {
  const val = parseInt(hex, 16);
  if (Number.isNaN(val)) return NaN;
  return Math.round((val / (16 ** hex.length - 1)) * 255);
}

/** BT.601 perceived luminance — weights human eye sensitivity to green > red > blue. */
function themeFromRgb(rHex: string, gHex: string, bHex: string): Theme | undefined {
  const r = hexTo8bit(rHex);
  const g = hexTo8bit(gHex);
  const b = hexTo8bit(bHex);

  if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) return undefined;

  const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
  return luminance < 128 ? 'dark' : 'light';
}

interface StdinHandle {
  stdin: NodeJS.ReadStream;
  wasRaw: boolean | undefined;
  wasFlowing: boolean | null;
}

function setupStdin(stdin: NodeJS.ReadStream): StdinHandle | undefined {
  const wasRaw = stdin.isRaw;
  const wasFlowing = stdin.readableFlowing;
  try {
    stdin.setRawMode(true);
  } catch {
    return undefined;
  }
  stdin.resume();
  return { stdin, wasRaw, wasFlowing };
}

function restoreStdin({ stdin, wasRaw, wasFlowing }: StdinHandle): void {
  try {
    stdin.setRawMode(wasRaw ?? false);
  } catch {
    // noop
  }
  if (!wasFlowing) stdin.pause();
}

/**
 * Query the terminal's background color via OSC 11 and derive the theme from it.
 * Resolves `undefined` if the terminal doesn't respond before `timeoutMs`.
 */
function queryOsc11(
  stdin: NodeJS.ReadStream,
  stdout: NodeJS.WriteStream,
  timeoutMs: number,
): Promise<Theme | undefined> {
  return new Promise((resolve) => {
    let buf = '';

    const cleanup = () => {
      clearTimeout(timer);
      stdin.removeListener('data', onData);
      stdin.removeListener('error', onError);
    };

    const onData = (chunk: Buffer) => {
      buf += chunk.toString('utf8');
      const match = buf.match(OSC_11_RESPONSE);
      if (!match) return;
      cleanup();
      resolve(themeFromRgb(match[1], match[2], match[3]));
    };

    const onError = () => {
      cleanup();
      resolve(undefined);
    };

    stdin.on('data', onData);
    stdin.on('error', onError);

    // OSC 11 query: write `ESC]11;?BEL` and the terminal responds with its background RGB.
    // For tmux, we wrap the query in a DCS passthrough so it reaches the outer terminal.
    let query = '\x1b]11;?\x07';
    if (process.env.TMUX) {
      query = `\x1bPtmux;\x1b${query}\x1b\\`;
    }
    stdout.write(query);

    const timer = setTimeout(() => {
      cleanup();
      resolve(undefined);
    }, timeoutMs);
  });
}

/**
 * Detects whether the terminal has a dark or light background.
 *
 * Detection chain (first match wins):
 * 1. `GITLAB_DUO_CLI_THEME` env var — explicit user override
 * 2. `COLORFGBG` env var — set by some terminals (rxvt, xterm, iTerm2) as "fg;bg" ANSI
 *    color indices. Only 0 (black → dark) and 15 (white → light) are high-confidence.
 * 3. OSC 11 query — asks the terminal for its actual background RGB via an escape sequence.
 *    Most modern terminals (iTerm2, Kitty, WezTerm, GNOME Terminal, etc.) respond.
 * 4. Falls back to 'dark' if nothing responds.
 */
export async function detectTerminalTheme(options?: {
  stdin?: NodeJS.ReadStream;
  stdout?: NodeJS.WriteStream;
}): Promise<Theme> {
  const envTheme = process.env.GITLAB_DUO_CLI_THEME;
  if (envTheme === 'light' || envTheme === 'dark') return envTheme;

  // COLORFGBG is a legacy convention (originating from rxvt) where the terminal advertises
  // foreground and background as ANSI color indices, e.g. "15;0" = white-on-black.
  // We only trust the two unambiguous extremes to avoid misclassifying custom palettes.
  const colorFgBg = process.env.COLORFGBG;
  if (colorFgBg) {
    const parts = colorFgBg.split(';');
    const bg = parseInt(parts[parts.length - 1], 10);
    if (bg === 0) return 'dark';
    if (bg === 15) return 'light';
  }

  const stdin = options?.stdin ?? process.stdin;
  const stdout = options?.stdout ?? process.stdout;

  // Skip the OSC 11 query in environments that can't handle it
  if (!stdin.isTTY) return DEFAULT_THEME;
  if (process.env.STY) return DEFAULT_THEME; // GNU Screen doesn't pass through OSC queries
  if (process.env.TERM === 'dumb' || process.env.TERM === 'linux') return DEFAULT_THEME;
  // The resume/pause + raw-mode dance below leaves Bun-compiled binaries
  // attached to a Windows console with stdin in a paused state, so the TUI's
  // 'data' listener never receives keystrokes. Skip the probe on Windows.
  if (process.platform === 'win32') return DEFAULT_THEME;

  const handle = setupStdin(stdin);
  if (!handle) return DEFAULT_THEME;

  // SSH sessions have higher latency so we allow more time for the response
  const timeoutMs = process.env.SSH_CONNECTION || process.env.SSH_TTY ? 300 : 150;

  try {
    const result = await queryOsc11(stdin, stdout, timeoutMs);
    return result ?? DEFAULT_THEME;
  } finally {
    restoreStdin(handle);
  }
}
