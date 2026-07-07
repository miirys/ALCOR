#!/usr/bin/env node

/**
 * Manage the beta instance allowlist in packages/cli/src/beta_instance_allowlist.ts
 *
 * Usage:
 *   node scripts/dev/beta-allowlist.mjs add <instance_url>
 *   node scripts/dev/beta-allowlist.mjs remove <instance_url>
 *
 * No plaintext URLs are persisted — they are only used transiently to compute hashes.
 */

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const [command, url] = process.argv.slice(2);
if (!['add', 'remove'].includes(command) || !url) {
  console.error('Usage: beta-allowlist.mjs {add|remove} <instance_url>');
  process.exit(1);
}

const ALLOWLIST_FILE = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../packages/cli/src/beta_instance_allowlist.ts',
);
const ARRAY_RE = /export const ALLOWED_INSTANCE_HASHES: readonly string\[\] = \[([\s\S]*?)\];/;

const hash = createHash('sha256')
  .update(url.toLowerCase().replace(/\/+$/, ''))
  .digest('hex');

const source = readFileSync(ALLOWLIST_FILE, 'utf-8');
const match = source.match(ARRAY_RE);
if (!match) throw new Error('Could not find ALLOWED_INSTANCE_HASHES in source file');

const hashes = [...match[1].matchAll(/'([a-f0-9]{64})'/g)].map((m) => m[1]);

if (command === 'add') {
  if (hashes.includes(hash)) {
    console.log(`Hash already present: ${hash}`);
    process.exit(0);
  }
  hashes.push(hash);
} else {
  const index = hashes.indexOf(hash);
  if (index === -1) {
    console.error(`Hash not found: ${hash}`);
    process.exit(1);
  }
  hashes.splice(index, 1);
}

const arrayContent =
  hashes.length === 0 ? '[]' : `[\n${hashes.map((h) => `  '${h}',`).join('\n')}\n]`;

writeFileSync(
  ALLOWLIST_FILE,
  source.replace(ARRAY_RE, `export const ALLOWED_INSTANCE_HASHES: readonly string[] = ${arrayContent};`),
  'utf-8',
);
console.log(`${command === 'add' ? 'Added' : 'Removed'} hash: ${hash}`);
console.log('Remember to never mention customer name, instance identifier, or hostnames in your commit messages.');
