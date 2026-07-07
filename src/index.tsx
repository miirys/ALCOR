#!/usr/bin/env -S npx tsx
/**
 * ALCOR — agent harness TUI (mock).
 * Runs on Bun (`bun src/index.tsx`) and Node via tsx (`npm start`).
 */
import React from 'react';
import { render } from 'ink';
import { App } from './app.tsx';

const out = process.stdout;

if (!out.isTTY) {
  console.error('alcor: needs an interactive terminal (TTY).');
  process.exit(1);
}

// fullscreen: alternate screen buffer + hidden cursor
const enter = () => out.write('\x1b[?1049h\x1b[?25l\x1b[2J\x1b[H');
const leave = () => out.write('\x1b[?1049l\x1b[?25h');

enter();
// Ctrl+C is handled in-app (double-press to exit), not by Ink.
const instance = render(<App />, { exitOnCtrlC: false });

let left = false;
const cleanup = () => {
  if (left) return;
  left = true;
  leave();
  const sessionId = (globalThis as Record<string, unknown>).__ALCOR_SESSION__;
  if (typeof sessionId === 'string') {
    out.write(`Resume this session with alcor --resume ${sessionId}\n`);
  }
};
process.on('exit', cleanup);
process.on('SIGTERM', () => {
  cleanup();
  process.exit(0);
});

instance.waitUntilExit().then(cleanup);
