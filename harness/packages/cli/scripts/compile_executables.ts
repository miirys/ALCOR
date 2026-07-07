#!/usr/bin/env bun
// ========================================
// Compiles executables for the CLI using Bun's build system.
//
// Usage:
//   bun ./scripts/compile_executables.ts [mode]
//
//   mode:
//     all        (default) Cross-platform binaries for all supported architectures.
//                Used in CI/release pipelines.
//     local-dev  Single binary for the current platform only, named 'duo-native'.
//                Used for local development via GLAB_DUO_CLI_BINARY_PATH.
//
// Version resolution (in priority order):
//   1. PACKAGE_VERSION env variable (used in release pipelines via semantic-release)
//   2. Root package.json version field (used in test/development builds)
//
// Environment variables:
//   PACKAGE_VERSION          Override the version baked into the binary.
//   SUPPORTED_TARGETS        Space-separated list of bun targets to build (defaults to all).
//   SKIP_RIPGREP_BUNDLE      "1" to skip downloading/embedding rg (binary falls back to system rg).
//   SENTRY_TRACKING_ENABLED  "true" to upload source maps to Sentry.
// ========================================
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { platform, tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { log, summary } from '../../../scripts/lib/deploy_log';
import {
  type BunTarget,
  DEFAULT_TARGETS,
  detectBunTarget,
  getExecutableName,
  getPlatformFromTarget,
} from './lib/build_targets';
import { runBunBuild, runSubprocess } from './lib/bun_compile';
import { downloadRgBinaries } from './lib/rg_download';
import { generateRgShim, readRgVersion, restoreStubShim } from './lib/rg_shim';

const IS_WINDOWS = platform() === 'win32';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
// Run from packages/cli regardless of where the script is invoked from.
const CLI_ROOT = resolve(__dirname, '..');
process.chdir(CLI_ROOT);

// ========================================
// Configuration
// ========================================
const BIN_DIR = './bin';
const SOURCE_FILE = './src/index.tsx';
const ROOT_PACKAGE_JSON = '../../package.json';
const RG_DIR = '../../rg-binaries';
const RG_POSTINSTALL = '../../node_modules/@vscode/ripgrep/lib/postinstall.js';
const UPLOAD_SOURCEMAPS_SCRIPT = '../../scripts/upload_binary_sourcemaps.sh';

const SKIP_RIPGREP_BUNDLE = process.env.SKIP_RIPGREP_BUNDLE === '1';
const SUPPORTED_TARGETS: BunTarget[] = process.env.SUPPORTED_TARGETS
  ? (process.env.SUPPORTED_TARGETS.split(/\s+/).filter(Boolean) as BunTarget[])
  : DEFAULT_TARGETS;

// Ensure stub shim is restored on exit (success, failure, or interrupt). Bash
// used `trap '...' EXIT`; here we register both a normal-path try/finally in
// main() AND signal handlers for Ctrl-C / SIGTERM.
//
// Note on Windows: Node emulates SIGINT for Ctrl+C but SIGTERM is partial.
// We avoid `process.kill(self, signal)` because it can't reliably re-raise
// signals on Windows; a plain `process.exit` is portable.
function installShimRestoreHandlers(): void {
  const cleanup = () => {
    restoreStubShim();
    // 130 is the conventional exit code for SIGINT / Ctrl+C on POSIX. On
    // Windows it has no special meaning but is still distinguishable from 0.
    process.exit(130);
  };
  process.once('SIGINT', cleanup);
  // SIGTERM has no effect on Windows but listening is harmless.
  if (!IS_WINDOWS) process.once('SIGTERM', cleanup);
}

function getVersionFromPackageJson(packageJsonPath: string): string {
  const json = JSON.parse(readFileSync(packageJsonPath, 'utf8')) as { version?: string };
  if (!json.version) throw new Error(`No version field in ${packageJsonPath}`);
  return json.version;
}

function ensureCleanDirectory(dir: string): void {
  log.info(`Creating empty directory: ${dir}`);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
}

async function buildForTarget(opts: {
  target: BunTarget;
  version: string;
  outputPath: string;
  environment: 'production' | 'development';
  rgVersion: string | null;
}): Promise<void> {
  const { target, version, outputPath, environment, rgVersion } = opts;

  if (rgVersion !== null) {
    generateRgShim({ target, rgDir: RG_DIR, rgVersion });
  }

  log.info(`Building for target: ${target}`);
  await log.run(`bun build → ${outputPath}`, () =>
    runBunBuild({ sourceFile: SOURCE_FILE, output: outputPath, target, version, environment }),
  );
  log.ok(`Built: ${outputPath}`);
}

// ========================================
// Build Modes
// ========================================

// Builds an intermediate non-compiled bundle with external source maps and
// uploads them to Sentry. Uses the same entrypoint and defines as the binary
// build so the maps match the compiled output. This is a no-op when
// SENTRY_TRACKING_ENABLED != true.
async function uploadSourcemaps(version: string): Promise<void> {
  const sourcemapsDir = mkdtempSync(join(tmpdir(), 'duo-sourcemaps-'));
  log.section('Sentry source map upload');
  log.info('Building intermediate bundle for source map extraction');
  try {
    await runBunBuild({
      sourceFile: SOURCE_FILE,
      output: sourcemapsDir,
      target: 'bun',
      version,
      environment: 'production',
    });
    log.ok('Intermediate bundle built');
    await runSubprocess('bash', [UPLOAD_SOURCEMAPS_SCRIPT, '--sourcemaps-dir', sourcemapsDir]);
  } finally {
    rmSync(sourcemapsDir, { recursive: true, force: true });
  }
}

async function buildAll(version: string, rgVersion: string | null): Promise<boolean> {
  log.section('CLI compilation (all targets)');
  summary.start(`duo CLI compile ${version}`);

  if (process.env.SENTRY_TRACKING_ENABLED !== 'true') {
    summary.add('sourcemap upload', 'skip', 'SENTRY_TRACKING_ENABLED != true');
  } else {
    // TODO: port upload_binary_sourcemaps.sh to a bun CLI script so the upload
    // step doesn't depend on bash being on PATH (which it isn't on Windows by default).
    try {
      await uploadSourcemaps(version);
      summary.add('sourcemap upload', 'ok');
    } catch {
      summary.add('sourcemap upload', 'fail', 'see output above');
    }
  }

  ensureCleanDirectory(BIN_DIR);

  for (const target of SUPPORTED_TARGETS) {
    const platformSlug = getPlatformFromTarget(target);
    const executableName = getExecutableName(platformSlug);
    const outputPath = `${BIN_DIR}/${executableName}`;
    try {
      await buildForTarget({
        target,
        version,
        outputPath,
        environment: 'production',
        rgVersion,
      });
      summary.add(target, 'ok', outputPath);
    } catch {
      summary.add(target, 'fail', 'build failed');
    }
  }

  return summary.print();
}

async function buildLocalDev(version: string, rgVersion: string | null): Promise<void> {
  log.section('CLI compilation (local-dev)');
  const target = detectBunTarget();
  log.info(`Detected platform target: ${target}`);

  mkdirSync(BIN_DIR, { recursive: true });
  await buildForTarget({
    target,
    version,
    // Bun appends .exe to compiled binaries on Windows targets; make it
    // explicit so the output path in logs matches the file on disk.
    outputPath: `${BIN_DIR}/duo-native${IS_WINDOWS ? '.exe' : ''}`,
    environment: 'development',
    rgVersion,
  });
}

// ========================================
// Main
// ========================================
async function main(): Promise<void> {
  const mode = process.argv[2] ?? 'all';
  if (mode !== 'all' && mode !== 'local-dev') {
    log.error(`Unknown mode '${mode}'. Use 'all' or 'local-dev'.`);
    process.exit(1);
  }

  if (!existsSync(SOURCE_FILE)) {
    log.error(`Source file not found: ${SOURCE_FILE}`);
    process.exit(1);
  }
  if (!existsSync(ROOT_PACKAGE_JSON)) {
    log.error(`Root package.json not found: ${ROOT_PACKAGE_JSON}`);
    process.exit(1);
  }

  let version = process.env.PACKAGE_VERSION ?? '';
  if (version) {
    log.info(`Using version from PACKAGE_VERSION environment variable: ${version}`);
  } else {
    try {
      version = getVersionFromPackageJson(ROOT_PACKAGE_JSON);
    } catch (err) {
      log.error(`Failed to extract version from ${ROOT_PACKAGE_JSON}: ${(err as Error).message}`);
      process.exit(1);
    }
    log.info(`Using version from package.json: ${version}`);
  }

  // Download rg binaries and resolve the rg version (unless skipped).
  let rgVersion: string | null = null;
  if (!SKIP_RIPGREP_BUNDLE) {
    if (!existsSync(RG_POSTINSTALL)) {
      log.error(`@vscode/ripgrep not found at ${RG_POSTINSTALL}`);
      log.error("Run 'bun install' first to install dependencies.");
      process.exit(1);
    }
    rgVersion = readRgVersion(RG_POSTINSTALL);
    log.info(`Using rg version: ${rgVersion}`);
    await downloadRgBinaries({
      rgDir: RG_DIR,
      rgVersion,
      targets: SUPPORTED_TARGETS,
    });
  } else {
    log.info('Skipping ripgrep download (SKIP_RIPGREP_BUNDLE is set)');
  }

  installShimRestoreHandlers();
  // Don't call process.exit() inside the try block: it would skip the
  // `finally` and leave the generated rg shim in place of the committed stub
  // (the bash version restored it via `trap '...' EXIT` on every exit path).
  let ok = true;
  try {
    if (mode === 'all') ok = await buildAll(version, rgVersion);
    else await buildLocalDev(version, rgVersion);
  } finally {
    restoreStubShim();
  }
  if (!ok) process.exit(1);
}

main().catch((err) => {
  log.error((err as Error).message);
  restoreStubShim();
  process.exit(1);
});
