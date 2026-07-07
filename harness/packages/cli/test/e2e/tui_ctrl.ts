#!/usr/bin/env bun
/**
 * tui-ctrl — CLI for controlling TUI test sessions via tmux.
 *
 * Designed for agents to drive interactive Duo CLI sessions from shell scripts.
 * Uses TmuxSession for session management.
 *
 * Usage: tui-ctrl <command> -s SESSION_NAME [options]
 */

import { mkdirSync, existsSync } from 'fs';
import { resolve, dirname, join } from 'path';
import { parseArgs } from 'node:util';
import { setTimeout as sleep } from 'node:timers/promises';
import stripAnsi from 'strip-ansi';
import { TmuxSession } from './tmux_session';

// ── Helpers ──────────────────────────────────────────────────────────────────

function fail(msg: string): never {
  process.stderr.write(`error: ${msg}\n`);
  process.exit(1);
}

function info(msg: string): void {
  process.stderr.write(`ℹ ${msg}\n`);
}

const DEFAULT_RECORDING_DIR = '/tmp/tui-ctrl-recordings';

function parseCli(argv: string[]): {
  command: string;
  flags: Record<string, string | undefined>;
  positional: string[];
} {
  const command = argv[0];
  if (!command) fail('Usage: tui-ctrl <command> [options]');

  const { values, positionals } = parseArgs({
    args: argv.slice(1),
    options: {
      session: { type: 'string', short: 's' },
      cols: { type: 'string' },
      rows: { type: 'string' },
      cwd: { type: 'string' },
      record: { type: 'string' },
      title: { type: 'string' },
      'idle-limit': { type: 'string' },
      timeout: { type: 'string' },
      delay: { type: 'string' },
      file: { type: 'string' },
    },
    allowPositionals: true,
  });

  return { command, flags: values, positional: positionals };
}

function requireSession(flags: Record<string, string | undefined>): string {
  const s = flags.session;
  if (!s) fail('-s SESSION_NAME is required');
  return s;
}

function getTmux(flags: Record<string, string | undefined>): TmuxSession {
  return new TmuxSession(requireSession(flags));
}

function capturePane(tmux: TmuxSession, full: boolean): string {
  const raw = full ? tmux.capturePaneFull() : tmux.capturePane();
  return stripAnsi(raw);
}

/**
 * Send text character-by-character with a small delay between each.
 * Ink/React TUIs process raw key input and can miss characters
 * when a full string is sent as a single tmux event.
 *
 * @param delayMs - milliseconds to wait between characters (0 = no delay)
 */
async function sendChars(tmux: TmuxSession, text: string, delayMs: number = 0): Promise<void> {
  for (const char of text) {
    tmux.sendKeys(char);
    if (delayMs > 0) {
      await sleep(delayMs); // eslint-disable-line no-await-in-loop
    }
  }
}

const KEY_MAP: Record<string, string> = {
  enter: 'Enter',
  return: 'Enter',
  escape: 'Escape',
  esc: 'Escape',
  tab: 'Tab',
  backspace: 'BSpace',
  bspace: 'BSpace',
  delete: 'DC',
  del: 'DC',
  up: 'Up',
  down: 'Down',
  left: 'Left',
  right: 'Right',
  home: 'Home',
  end: 'End',
  'ctrl-c': 'C-c',
  'ctrl-d': 'C-d',
  'ctrl-z': 'C-z',
  'ctrl-r': 'C-r',
  'ctrl-a': 'C-a',
  'ctrl-e': 'C-e',
  'ctrl-j': 'C-j',
  'ctrl-o': 'C-o',
  'ctrl-left': 'C-Left',
  'ctrl-right': 'C-Right',
  'ctrl-backspace': 'C-BSpace',
  'ctrl-delete': 'C-DC',
};

// ── Commands ─────────────────────────────────────────────────────────────────

async function cmdLaunch(
  flags: Record<string, string | undefined>,
  positional: string[],
): Promise<void> {
  const session = requireSession(flags);
  if (TmuxSession.exists(session)) fail(`Session '${session}' already exists`);
  if (positional.length === 0) fail('launch requires CMD [ARGS...]');

  const cols = flags.cols ?? '120';
  const rows = flags.rows ?? '50';
  const cwd = flags.cwd ?? process.cwd();

  const tmux = TmuxSession.create({
    sessionName: session,
    cols: parseInt(cols, 10),
    rows: parseInt(rows, 10),
    cwd,
  });

  const fullCommand = positional.map(TmuxSession.shellEscape).join(' ');
  const recordFile = flags.record ?? join(DEFAULT_RECORDING_DIR, session, 'recording.cast');
  const castDir = dirname(recordFile);
  mkdirSync(castDir, { recursive: true });

  // Always record with asciinema
  const titleArg = flags.title ? ` --title ${TmuxSession.shellEscape(flags.title)}` : '';
  const idleLimit = flags['idle-limit'] ?? '2';
  const recCmd = `asciinema rec --overwrite --idle-time-limit ${idleLimit}${titleArg} --command ${TmuxSession.shellEscape(fullCommand)} ${TmuxSession.shellEscape(resolve(recordFile))}`;

  tmux.sendCommand(recCmd);

  // Wait for asciinema to start before returning — prevents the caller
  // from sending keys before the recorded process is ready.
  const recTimeout = 15_000;
  const recStart = Date.now();
  while (Date.now() - recStart < recTimeout) {
    const pane = capturePane(tmux, false);
    if (pane.includes('Recording to')) break;
    await sleep(200); // eslint-disable-line no-await-in-loop
  }
  info(`Session '${session}' started with recording → ${recordFile} (${cols}x${rows})`);
}

async function cmdWriteln(
  flags: Record<string, string | undefined>,
  positional: string[],
): Promise<void> {
  const tmux = getTmux(flags);
  const text = positional.join(' ');
  if (!text) fail('writeln requires TEXT');
  const delay = parseInt(flags.delay ?? '0', 10);
  await sendChars(tmux, text, delay);
  tmux.sendKey('Enter');
}

async function cmdWrite(
  flags: Record<string, string | undefined>,
  positional: string[],
): Promise<void> {
  const tmux = getTmux(flags);
  const text = positional.join(' ');
  if (!text) fail('write requires TEXT');
  const delay = parseInt(flags.delay ?? '0', 10);
  await sendChars(tmux, text, delay);
}

async function cmdKey(
  flags: Record<string, string | undefined>,
  positional: string[],
): Promise<void> {
  const tmux = getTmux(flags);
  const keyName = positional[0];
  if (!keyName) fail('key requires KEY');

  const tmuxKey = KEY_MAP[keyName.toLowerCase()];
  if (tmuxKey) {
    tmux.sendKey(tmuxKey);
  } else if (keyName.length === 1) {
    await sendChars(tmux, keyName);
  } else {
    fail(`Unknown key: ${keyName}. Available: ${Object.keys(KEY_MAP).join(', ')}`);
  }
}

function cmdScreen(flags: Record<string, string | undefined>): void {
  const tmux = getTmux(flags);
  process.stdout.write(capturePane(tmux, false));
}

function cmdScrollback(flags: Record<string, string | undefined>): void {
  const tmux = getTmux(flags);
  process.stdout.write(capturePane(tmux, true));
}

async function cmdWait(
  flags: Record<string, string | undefined>,
  positional: string[],
): Promise<void> {
  const tmux = getTmux(flags);
  const sessionName = requireSession(flags);
  const pattern = positional[0];
  if (!pattern) fail('wait requires PATTERN');
  const timeout = parseInt(flags.timeout ?? '30', 10) * 1000;

  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (!TmuxSession.exists(sessionName)) fail('Session died unexpectedly');
    const output = capturePane(tmux, false);
    if (output.includes(pattern)) {
      info(`Found '${pattern}'`);
      return;
    }
    await sleep(100); // eslint-disable-line no-await-in-loop
  }

  process.stderr.write(`Timeout waiting for '${pattern}'. Current screen:\n`);
  process.stderr.write(capturePane(tmux, false));
  process.exit(1);
}

async function cmdWaitAbsent(
  flags: Record<string, string | undefined>,
  positional: string[],
): Promise<void> {
  const tmux = getTmux(flags);
  const sessionName = requireSession(flags);
  const pattern = positional[0];
  if (!pattern) fail('wait-absent requires PATTERN');
  const timeout = parseInt(flags.timeout ?? '30', 10) * 1000;

  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (!TmuxSession.exists(sessionName)) fail('Session died unexpectedly');
    const output = capturePane(tmux, false);
    if (!output.includes(pattern)) {
      info(`'${pattern}' absent`);
      return;
    }
    await sleep(100); // eslint-disable-line no-await-in-loop
  }

  process.stderr.write(`Timeout waiting for '${pattern}' to disappear\n`);
  process.exit(1);
}

async function cmdWaitDuo(flags: Record<string, string | undefined>): Promise<void> {
  requireSession(flags);
  const timeout = flags.timeout ?? '60';

  // Wait for ● then input ready
  await cmdWait({ ...flags, timeout }, ['●']);
  await cmdWait({ ...flags, timeout }, ['Type your message']);
}

async function cmdStopRecording(
  flags: Record<string, string | undefined>,
  positional: string[],
): Promise<void> {
  const tmux = getTmux(flags);
  // Send exit to end the recorded command, which finalizes the .cast.
  // NOTE: the caller must send ctrl-c first if a TUI (e.g. Duo) has input focus,
  // otherwise 'exit' is typed into the TUI instead of the shell.
  tmux.sendCommand('exit');

  // If a cast file path was given, wait for it to be written
  const castFile = positional[0] ?? flags.file;
  if (castFile) {
    const stopTimeout = 10_000;
    const stopStart = Date.now();
    while (Date.now() - stopStart < stopTimeout) {
      if (existsSync(castFile)) {
        info(`Recording saved: ${castFile}`);
        return;
      }
      await sleep(200); // eslint-disable-line no-await-in-loop
    }
    info('Recording stop signal sent (file not yet confirmed)');
  } else {
    await sleep(1000);
    info('Recording stop signal sent');
  }
}

function cmdKill(flags: Record<string, string | undefined>): void {
  const session = requireSession(flags);
  const tmux = new TmuxSession(session);
  tmux.cleanup();
  info(`Session '${session}' killed`);
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const { command, flags, positional } = parseCli(process.argv.slice(2));

  switch (command) {
    case 'launch':
      await cmdLaunch(flags, positional);
      break;
    case 'writeln':
      await cmdWriteln(flags, positional);
      break;
    case 'write':
      await cmdWrite(flags, positional);
      break;
    case 'key':
      await cmdKey(flags, positional);
      break;
    case 'screen':
      cmdScreen(flags);
      break;
    case 'scrollback':
      cmdScrollback(flags);
      break;
    case 'wait':
      await cmdWait(flags, positional);
      break;
    case 'wait-absent':
      await cmdWaitAbsent(flags, positional);
      break;
    case 'wait-duo':
      await cmdWaitDuo(flags);
      break;
    case 'stop-recording':
      await cmdStopRecording(flags, positional);
      break;
    case 'kill':
      cmdKill(flags);
      break;
    default:
      fail(
        `Unknown command: ${command}\nCommands: launch, writeln, write, key, screen, scrollback, wait, wait-absent, wait-duo, stop-recording, kill`,
      );
  }
}

main().catch((err) => {
  process.stderr.write(`${err}\n`);
  process.exit(1);
});
