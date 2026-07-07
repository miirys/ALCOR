#!/usr/bin/env node

const { spawnSync } = require('child_process');
const { join } = require('path');

// Parse Node.js version
const version = process.version;
// slice skips the `v` from `v22.0.1`
const versionParts = version.slice(1).split('.');
const majorVersion = parseInt(versionParts[0], 10);
const minorVersion = parseInt(versionParts[1], 10);
const patchVersion = parseInt(versionParts[2], 10);

const isVersionTooOld = majorVersion < 20 || (majorVersion === 20 && minorVersion < 17);

if (isVersionTooOld) {
  console.error('Error: GitLab Duo CLI requires Node.js version 20.17 or higher.');
  console.error(`Current version: ${version}`);
  console.error('\nPlease upgrade your Node.js installation:');
  console.error('  - Visit https://nodejs.org/ to download the latest version');
  console.error('  - Or use a version manager like nvm, fnm, or asdf');
  process.exit(1);
}

const cliPath = join(__dirname, 'index.js');

// Deprecation warnings are filtered per-code inside the CLI entry
// (src/suppress_node_warnings.ts) so only the noisy DEP0040/DEP0169 are
// dropped and genuinely new deprecations still surface. So we do NOT pass a
// blanket --no-deprecation here.
const nodeArgs = [];

// --use-system-ca is available in v22.20.0+ and v23.8.0+ (and all v24+)
const supportsSystemCA =
  majorVersion >= 24 ||
  (majorVersion === 23 && minorVersion >= 8) ||
  (majorVersion === 22 && minorVersion >= 20);

if (supportsSystemCA) {
  nodeArgs.push('--use-system-ca');
}

nodeArgs.push(cliPath, ...process.argv.slice(2));

const result = spawnSync(process.execPath, nodeArgs, {
  stdio: 'inherit',
});

process.exit(result.status || 0);
