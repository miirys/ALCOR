import { existsSync, readdirSync, rmSync, mkdirSync, copyFileSync, chmodSync } from 'node:fs';

import { log, summary } from '../../../scripts/lib/deploy_log';

// ========================================
// This script transpiles the CLI application to node-compatible JavaScript
// ========================================

const DIST_DIR = './dist';
const SOURCE_FILE = './src/index.tsx';

function ensureCleanDirectory(dir: string): void {
  log.info(`Creating empty directory: ${dir}`);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
}

function validateDependencies(): void {
  log.info('Validating build dependencies');

  if (!existsSync(SOURCE_FILE)) {
    log.error(`Source file not found: ${SOURCE_FILE}`);
    process.exit(1);
  }

  log.ok('All dependencies validated');
}

async function buildApplication(): Promise<void> {
  await log.run('Building CLI application with bun', async () => {
    const proc = Bun.spawn(['bun', './scripts/bun_build.ts'], {
      env: { ...process.env, NODE_ENV: 'production' },
      stdout: 'inherit',
      stderr: 'inherit',
    });

    const exitCode = await proc.exited;
    if (exitCode !== 0) {
      throw new Error('Build failed');
    }
  });
}

function copyVersionGuard(): void {
  log.info('Copying version guard to dist');

  const src = './scripts/version-guard.cjs';
  const dest = `${DIST_DIR}/version-guard.cjs`;

  if (!existsSync(src)) {
    log.error(`Version guard not found: ${src}`);
    process.exit(1);
  }

  copyFileSync(src, dest);
  chmodSync(dest, 0o755);

  log.ok('Version guard copied successfully');
}

function verifyBuildOutput(): void {
  log.info('Verifying build output');

  if (!existsSync(DIST_DIR)) {
    log.error(`Build output directory not found: ${DIST_DIR}`);
    process.exit(1);
  }

  const files = readdirSync(DIST_DIR);
  if (files.length === 0) {
    log.error('Build output directory is empty');
    process.exit(1);
  }

  log.ok('Build output verified');
}

async function main(): Promise<void> {
  log.section('CLI build');
  summary.start('duo CLI build');

  validateDependencies();
  ensureCleanDirectory(DIST_DIR);

  try {
    await buildApplication();
    summary.add('build', 'ok');
  } catch (err) {
    summary.add('build', 'fail', (err as Error).message);
    summary.print();
    process.exit(1);
  }

  copyVersionGuard();
  verifyBuildOutput();

  summary.add('version guard', 'ok', `${DIST_DIR}/version-guard.cjs`);
  summary.add('verify output', 'ok', DIST_DIR);

  if (!summary.print()) process.exit(1);
}

await main();
