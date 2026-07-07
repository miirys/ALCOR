#!/usr/bin/env bun
import { spawn } from 'node:child_process';

const devtools = spawn('npx', ['react-devtools'], {
  detached: true,
  stdio: 'ignore',
});
devtools.unref();

const devWatch = spawn('bun', ['--conditions=_ts-source', '--watch', './src/index.tsx'], {
  stdio: 'inherit',
  env: { ...process.env, DEV: 'true' },
});

const cleanup = () => {
  try {
    process.kill(-devtools.pid!, 'SIGTERM');
  } catch {}
};

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);
devWatch.on('exit', (code) => {
  cleanup();
  process.exit(code ?? 0);
});
