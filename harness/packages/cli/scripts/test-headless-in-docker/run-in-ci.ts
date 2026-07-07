#!/usr/bin/env bun

/**
 * CI Headless Workflow Test Runner
 *
 * This script runs inside the workflow Docker image in CI. It:
 * 1. Runs the shared setup (fetches credentials, creates workflow session).
 *    The CLI binary is provided by the upstream `build_cli_binaries_artifact-unsigned`
 *    job via the `DUO_CLI_BINARY_PATH` environment variable.
 * 2. Spawns `duo run` in an isolated subprocess WITHOUT the full CI env.
 *
 * The subprocess environment contains only limited-scope credentials from the
 * direct_access API, ensuring the workflow executor cannot access the full token.
 */

import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

import { runSetup } from './setup';

const WORKSPACE_DIR = '/workspace';

function buildLimitedEnv(envMap: Map<string, string>): Record<string, string> {
  // envMap already contains all configured values from .env.template
  // plus all direct_access credentials set by shared setup
  const env: Record<string, string> = Object.fromEntries(envMap);

  // Add system essentials needed for subprocess execution
  env.PATH = process.env.PATH || '/usr/local/bin:/usr/bin:/bin';
  env.HOME = process.env.HOME || '/root';
  env.TERM = process.env.TERM || 'xterm';

  return env;
}

async function main() {
  const binaryPath = process.env.DUO_CLI_BINARY_PATH;
  if (!binaryPath) {
    console.error('DUO_CLI_BINARY_PATH must point to a pre-built CLI binary');
    process.exit(1);
  }

  try {
    const result = await runSetup({ existingBinaryPath: resolve(binaryPath) });

    console.log(`\nCloning repository: ${result.cloneUrl}`);
    spawnSync('git', ['clone', result.cloneUrl, WORKSPACE_DIR], { stdio: 'inherit' });

    console.log('\nBuilding isolated environment for duo run...');
    const limitedEnv = buildLimitedEnv(result.envMap);

    console.log('\n--- Starting duo run in isolated subprocess ---\n');

    const spawnResult = spawnSync(result.binaryPath, ['run'], {
      cwd: WORKSPACE_DIR,
      env: limitedEnv,
      stdio: 'inherit',
    });

    if (spawnResult.error) {
      throw spawnResult.error;
    }

    console.log(`\n--- duo run completed with exit code: ${spawnResult.status} ---`);
    process.exit(spawnResult.status || 0);
  } catch (error) {
    console.error(`\nError: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  }
}

main();
