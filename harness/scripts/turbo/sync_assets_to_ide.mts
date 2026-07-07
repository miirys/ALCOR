/**
 * Sync LSP build output to a consuming editor repo.
 *
 * Two consumers supported:
 *
 * - jetbrains: the plugin does not consume the LSP as an npm package at all.
 *   Its `package.json` only pins a version used by Gradle to download an
 *   official binary for release builds. In local-dev, the Gradle
 *   `prepareSandbox` task copies `tmp/language-server/` into the IntelliJ
 *   sandbox at `lib/gitlab-lsp/tmp/language-server/`. So we must drop the
 *   fresh bundle straight into `jb/tmp/language-server/`. Yalc has no role
 *   here and is ignored for this editor.
 *
 * - vscode: the extension consumes the LSP both as an npm package (for TS
 *   imports of types/constants, bundled into the extension by esbuild) AND as
 *   a runtime bundle file spawned as a child process. These have two separate
 *   on-disk locations:
 *     1. `node_modules/@gitlab-org/gitlab-lsp/` — yalc populates this.
 *     2. `dist-desktop/assets/language-server/` — vsc's own build populates
 *        this ONCE at watch start via `copyLanguageServerAssets` in
 *        `scripts/utils/common_jobs.mjs`. vsc has no file watcher on
 *        `node_modules/@gitlab-org/gitlab-lsp/out/**`, so subsequent LSP
 *        rebuilds will not refresh the runtime bundle unless we copy it
 *        ourselves. We therefore do yalc (for #1) AND manually copy (for #2)
 *        on every sync iteration.
 *
 *        FIXME: in a future iteration, we should fix the vscode watcher itself
 *               so that the installed node_modules is the SSOT and we don't
 *               need to copy LS into multiple places
 */

import assert from 'node:assert';
import { resolve, basename } from 'path';
import { cwd } from 'process';
import fsExtra from 'fs-extra';
import { execa } from 'execa';

const { copy, pathExists, readJSON, remove } = fsExtra;

const VSCODE_ASSETS_DIR = 'dist-desktop/assets/language-server';
const JETBRAINS_ASSETS_DIR = 'tmp/language-server';
const NODE_MODULES_DIR = 'node_modules/@gitlab-org/gitlab-lsp';
const PACKAGE_NAME = '@gitlab-org/gitlab-lsp';

const log = {
  info: (msg: string) => console.log(`ℹ  ${msg}`),
  success: (msg: string) => console.log(`✓  ${msg}`),
  error: (msg: string, ...args: unknown[]) => console.error(`✗  ${msg}`, args),
  warn: (msg: string) => console.warn(`⚠  ${msg}`),
};

/**
 * Check if the package is already installed via yalc in the editor directory
 */
async function checkYalcPackageInstalled(editorPath: string): Promise<boolean> {
  try {
    const yalcDir = resolve(editorPath, '.yalc', PACKAGE_NAME);
    const yalcExists = await pathExists(yalcDir);

    if (!yalcExists) {
      return false;
    }

    const packageJsonPath = resolve(editorPath, 'package.json');
    const packageJsonExists = await pathExists(packageJsonPath);

    if (!packageJsonExists) {
      return false;
    }

    const packageJson = await readJSON(packageJsonPath);
    const dependencies = { ...packageJson.dependencies, ...packageJson.devDependencies };
    const packageDep = dependencies[PACKAGE_NAME];

    return packageDep && packageDep.startsWith('file:');
  } catch (error) {
    log.warn(
      `Failed to check yalc package installation: ${error instanceof Error ? error.message : String(error)}`,
    );
    return false;
  }
}

/**
 * Install the package via yalc in the editor directory
 */
async function installYalcPackage(editorPath: string): Promise<void> {
  try {
    log.info(`Installing ${PACKAGE_NAME} via yalc in ${editorPath}...`);

    await execa('npx', ['yalc', 'add', PACKAGE_NAME], {
      cwd: editorPath,
      stdio: 'pipe',
    });

    log.success(`Installed ${PACKAGE_NAME} via yalc`);
    log.info(`Run "npm install" in ${editorPath} if LSP dependencies have changed`);
  } catch (error) {
    log.error(
      `Failed to install package via yalc: ${error instanceof Error ? error.message : String(error)}`,
    );
    throw error;
  }
}

/**
 * Publish the package to the yalc store (without pushing to consumers)
 */
async function publishYalc(): Promise<void> {
  const repoRoot = cwd();

  try {
    log.info('Publishing to yalc store...');

    await execa('npx', ['yalc', 'publish'], {
      cwd: repoRoot,
      stdio: 'pipe',
    });

    log.success('Published to yalc store');
  } catch (error) {
    log.error(
      `Failed to publish via yalc: ${error instanceof Error ? error.message : String(error)}`,
    );
    throw error;
  }
}

/**
 * Publish and push the package via yalc to all registered consumers
 */
async function publishAndPushYalc(): Promise<void> {
  const repoRoot = cwd();

  try {
    log.info('Publishing and pushing via yalc...');

    await execa('npx', ['yalc', 'publish', '--push'], {
      cwd: repoRoot,
      stdio: 'pipe',
    });

    log.success('Published and pushed via yalc');
  } catch (error) {
    log.error(
      `Failed to publish and push via yalc: ${error instanceof Error ? error.message : String(error)}`,
    );
    throw error;
  }
}

/**
 * Run the yalc-side of a vscode sync: publish + push the LSP package to all
 * registered consumers. On first run (no `.yalc/` dir in the editor), also
 * publishes to the store and registers the editor via `yalc add`.
 *
 * Only updates `node_modules/@gitlab-org/gitlab-lsp/`. The vscode runtime
 * asset directory is handled separately by the caller.
 */
async function syncViaYalc(editorPath: string): Promise<void> {
  const isInstalled = await checkYalcPackageInstalled(editorPath);

  if (!isInstalled) {
    log.info(`${PACKAGE_NAME} not yet installed into editor via yalc, installing...`);
    await publishYalc();
    await installYalcPackage(editorPath);
  }

  await publishAndPushYalc();
}

/**
 * Copy built files to editor directory based on editor type
 */
async function copyToEditorDirectory(editorPath: string, destinationDir: string): Promise<void> {
  try {
    const destinationPath = resolve(editorPath, destinationDir);
    const repoRoot = cwd();
    const outDir = resolve(repoRoot, 'out');

    await remove(destinationPath);
    await copy(outDir, destinationPath, { overwrite: true, errorOnExist: false });

    log.success(`Copied /${basename(outDir)} to ${destinationPath}`);
  } catch (error) {
    log.error(
      `Failed to copy to ${destinationDir}: ${error instanceof Error ? error.message : String(error)}`,
    );
    throw error;
  }
}

/**
 * Copy files to node_modules directory to simulate npm package installation.
 * Used when yalc mode is disabled — otherwise yalc owns this dir.
 */
async function copyToNodeModules(editorPath: string): Promise<void> {
  const repoRoot = cwd();
  const commandCwd = repoRoot;
  const nodeModulesDir = resolve(editorPath, NODE_MODULES_DIR);

  try {
    await remove(nodeModulesDir);
    log.info('Running bun pm pack --dry-run to determine files to copy...');
    const { stdout } = await execa('bun', ['pm', 'pack', '--dry-run', '--ignore-scripts'], {
      cwd: commandCwd,
    });

    // Parse bun pm pack output: lines like "packed <size> <filepath>"
    const filePaths = stdout
      .split('\n')
      .filter((line) => line.startsWith('packed '))
      .map((line) => {
        // "packed 11.39KB package.json" → extract the path after size
        const match = line.match(/^packed\s+\S+\s+(.+)$/);
        return match?.[1];
      })
      .filter(Boolean) as string[];

    if (filePaths.length === 0) {
      throw new Error('No files found in bun pm pack output');
    }

    await Promise.all(
      filePaths.map(async (filePath: string) => {
        const sourcePath = resolve(commandCwd, filePath);
        const destPath = resolve(nodeModulesDir, filePath);
        await copy(sourcePath, destPath, { overwrite: true, errorOnExist: false });
      }),
    );

    log.success(
      `Copied ${filePaths.length} files to ${basename(editorPath)}/node_modules/@gitlab-org/gitlab-lsp`,
    );
  } catch (error) {
    log.error(
      `Failed to copy to node_modules: ${error instanceof Error ? error.message : String(error)}`,
    );
    throw error;
  }
}

/**
 * Sync flow for jetbrains. Always a direct copy into `tmp/language-server/`
 */
async function syncJetbrains(editorPath: string): Promise<void> {
  if (process.env.LS_SYNC_VIA_YALC === 'true') {
    log.warn('LS_SYNC_VIA_YALC has no effect for jetbrains; ignoring');
  }

  await copyToEditorDirectory(editorPath, JETBRAINS_ASSETS_DIR);
}

/**
 * Sync flow for vscode. When yalc mode is enabled we run yalc push (for the
 * node_modules-backed TS imports) AND manually copy into
 * `dist-desktop/assets/language-server/` (for the runtime bundle path). When
 * yalc mode is disabled we fall back to copying directly into both locations
 * ourselves.
 */
async function syncVscode(editorPath: string, yalcMode: boolean): Promise<void> {
  if (yalcMode) {
    await syncViaYalc(editorPath);
    await copyToEditorDirectory(editorPath, VSCODE_ASSETS_DIR);
  } else {
    await Promise.all([
      copyToEditorDirectory(editorPath, VSCODE_ASSETS_DIR),
      copyToNodeModules(editorPath),
    ]);
  }
}

/**
 * Main function to sync assets based on environment configuration
 */
async function main(): Promise<void> {
  const editor = process.env.LS_EDITOR;
  const editorPath = process.env.LS_EDITOR_PATH;
  assert(editor, 'LS_EDITOR environment variable is required');
  assert(editorPath, 'LS_EDITOR_PATH environment variable is required');

  const repoRoot = cwd();
  const resolvedEditorPath = resolve(repoRoot, editorPath);
  const yalcMode = process.env.LS_SYNC_VIA_YALC !== 'false';
  const startTime = Date.now();

  try {
    if (editor === 'jetbrains') {
      await syncJetbrains(resolvedEditorPath);
    } else if (editor === 'vscode') {
      await syncVscode(resolvedEditorPath, yalcMode);
    } else {
      log.error(`Unknown editor type: ${editor}. Not copying anything anywhere`);
      process.exit(1);
    }

    const duration = Date.now() - startTime;
    log.success(`Sync complete for ${editor} (${duration}ms total)`);
  } catch (error) {
    log.error(`Sync failed for ${editor}`);
    process.exit(1);
  }
}

main().catch((error) => {
  log.error(`Unhandled error: "${error instanceof Error ? error.message : String(error)}"`, error);
  process.exit(1);
});
