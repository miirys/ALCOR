// Standalone entrypoint for running a mockttp MITM proxy in its own Node
// process. The parent (test harness) spawns this, reads a single line of
// JSON with { url, caCertPath } from stdout, then kills the child on
// teardown.
//
// With --cert-only: generates a CA cert and exits immediately (no server).
// The parent receives { caCertPath, tmpDir } and owns cleanup.
//
// This exists because Jest's module loader cannot load mockttp's CJS
// code that require()s ESM-only deps (e.g. get-port). Running mockttp in a
// separate process sidesteps Jest's module loader entirely.

import * as mockttp from 'mockttp';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const tmp = join(tmpdir(), `cli-net-e2e-${process.pid}-${Date.now()}`);
mkdirSync(tmp, { recursive: true });

const ca = await mockttp.generateCACertificate();
const caCertPath = join(tmp, 'ca.pem');
const caKeyPath = join(tmp, 'ca.key');
writeFileSync(caCertPath, ca.cert);
writeFileSync(caKeyPath, ca.key);

// --cert-only mode: emit cert path and exit. No server, no cleanup.
if (process.argv.includes('--cert-only')) {
  process.stdout.write(`${JSON.stringify({ caCertPath, tmpDir: tmp })}\n`);
  process.exit(0);
}

const server = mockttp.getLocal({
  https: { keyPath: caKeyPath, certPath: caCertPath },
});

await server.forAnyRequest().thenPassThrough();
await server.forAnyWebSocket().thenPassThrough();
await server.start();

// Emit the connection info for the parent.
process.stdout.write(`${JSON.stringify({ url: server.url, caCertPath })}\n`);

const shutdown = async () => {
  try {
    await server.stop();
  } catch {
    // ignore
  }
  try {
    rmSync(tmp, { recursive: true, force: true });
  } catch {
    // ignore
  }
  process.exit(0);
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

// Keep process alive until signalled.
setInterval(() => {}, 1 << 30);
