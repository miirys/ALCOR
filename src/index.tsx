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
const instance = render(<App />, { exitOnCtrlC: true });

const cleanup = () => leave();
process.on('exit', cleanup);
process.on('SIGINT', () => {
  cleanup();
  process.exit(0);
});
process.on('SIGTERM', () => {
  cleanup();
  process.exit(0);
});

instance.waitUntilExit().then(cleanup);
