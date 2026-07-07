#!/usr/bin/env bun

/**
 * Local Docker Test Runner
 *
 * This script is for local engineer testing. It:
 * 1. Detects the Docker host architecture and builds the matching Linux binary
 * 2. Runs the shared setup (fetches credentials, creates workflow session)
 * 3. Launches a Docker container with the workflow image
 * 4. Runs `duo run` inside the container
 *
 * Usage:
 *   cd packages/cli/scripts/test-headless-in-docker
 *   bun -i ./run-in-docker.ts
 */

import { spawnSync } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { runSetup, type SetupResult, type LinuxBunTarget } from './setup.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const DEFAULT_DOCKER_IMAGE =
  'registry.gitlab.com/gitlab-org/duo-workflow/default-docker-image/workflow-generic-image:v0.0.6';

async function writeEnvFile(result: SetupResult): Promise<string> {
  const envPath = join(__dirname, '.env.generated');
  const lines: string[] = [];

  result.envMap.forEach((value, key) => {
    lines.push(`${key}=${value}`);
  });

  await writeFile(envPath, lines.join('\n'), 'utf-8');
  return envPath;
}

function runDockerContainer(
  binaryPath: string,
  cloneUrl: string,
  envFilePath: string,
  dockerImg: string,
  envMap: Map<string, string>,
) {
  const dockerShellScript = `git clone --depth 1 ${cloneUrl} /workspace && cd /workspace && /binary/duo run`;

  const extraHost = envMap.get('DOCKER_EXTRA_HOST_BINDS');
  const addHostArgs: string[] = [];
  if (extraHost) {
    extraHost.split(',').forEach((hostBind) => {
      addHostArgs.push('--add-host', hostBind.trim());
    });
  }

  const args = [
    'run',
    '-it',
    '--rm',
    ...addHostArgs,
    '--env-file',
    envFilePath,
    '-v',
    `${binaryPath}:/binary/duo:ro`,
    dockerImg,
    'sh',
    '-c',
    dockerShellScript,
  ];

  console.log('\nExecuting docker command:\ndocker ' + args.join(' ') + '\n');

  spawnSync('docker', args, { stdio: 'inherit' });
}

/**
 * Detects the architecture of the Docker host and returns the matching bun Linux target.
 * Falls back to x64 if detection fails.
 */
function detectDockerLinuxTarget(): LinuxBunTarget {
  const result = spawnSync('docker', ['info', '--format', '{{.Architecture}}'], {
    encoding: 'utf-8',
  });
  const arch = result.stdout?.trim();
  if (arch === 'aarch64' || arch === 'arm64') {
    return 'bun-linux-arm64';
  }
  return 'bun-linux-x64-baseline';
}

async function main() {
  const dockerImg = process.env.DOCKER_IMG || DEFAULT_DOCKER_IMAGE;
  const linuxTarget = detectDockerLinuxTarget();

  try {
    const result = await runSetup({ linuxTarget });

    console.log('\nWriting environment file...');
    const envFilePath = await writeEnvFile(result);

    console.log('\n🐳 Launching Docker container...\n');
    runDockerContainer(result.binaryPath, result.cloneUrl, envFilePath, dockerImg, result.envMap);

    console.log('\nAll done!\n');
  } catch (error) {
    console.error(`\nError: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  }
}

main();
