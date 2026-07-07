import { readFile, writeFile, access, readdir } from 'node:fs/promises';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { IConfigFile } from '@microsoft/api-extractor';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

interface PackageJson {
  name: string;
  workspaces?: string[];
  [key: string]: unknown;
}

type ApiExtractorConfig = IConfigFile & {
  $schema: string;
};

async function resolveWorkspaceDirs(rootDir: string, pattern: string): Promise<string[]> {
  const fullPattern = join(rootDir, pattern);

  if (pattern.endsWith('/*')) {
    const parentDir = fullPattern.slice(0, -2);
    try {
      await access(parentDir);
      const entries = await readdir(parentDir, { withFileTypes: true });
      return entries.filter((e) => e.isDirectory()).map((e) => join(parentDir, e.name));
    } catch {
      return [];
    }
  }

  try {
    await access(fullPattern);
    return [fullPattern];
  } catch {
    return [];
  }
}

async function readPackageName(dir: string): Promise<string | null> {
  const packageJsonPath = join(dir, 'package.json');
  try {
    await access(packageJsonPath);
    const packageJson: PackageJson = JSON.parse(await readFile(packageJsonPath, 'utf8'));
    return packageJson.name ?? null;
  } catch {
    return null;
  }
}

/**
 * The API extractor config has a list of all workspace package names inside it.
 * This script dynamically generates that list and updates the config file if it has changed.
 */
async function main() {
  const rootDir = resolve(__dirname, '..');
  const configPath = join(rootDir, 'api-extractor.json');

  const currentConfig: ApiExtractorConfig = JSON.parse(await readFile(configPath, 'utf8'));
  const rootPackageJson: PackageJson = JSON.parse(
    await readFile(join(rootDir, 'package.json'), 'utf8'),
  );

  const workspacePatterns = rootPackageJson.workspaces ?? [];
  const packageScopesToBundle = ['@gitlab-org/', '@gitlab-lsp/'];

  const workspaceDirs = (
    await Promise.all(workspacePatterns.map((pattern) => resolveWorkspaceDirs(rootDir, pattern)))
  ).flat();

  const names = await Promise.all(workspaceDirs.map(readPackageName));

  const packagesToBundle = names
    .filter((name): name is string => name !== null)
    .filter((name) => packageScopesToBundle.some((prefix) => name.startsWith(prefix)));

  packagesToBundle.sort();

  const existingPackages = [...(currentConfig.bundledPackages || [])].sort();
  const packagesChanged = JSON.stringify(packagesToBundle) !== JSON.stringify(existingPackages);

  if (!packagesChanged) {
    return;
  }

  const updatedConfig: ApiExtractorConfig = {
    ...currentConfig,
    bundledPackages: packagesToBundle,
  };

  await writeFile(configPath, `${JSON.stringify(updatedConfig, null, 2)}\n`);

  console.log(`
API extractor config "bundledPackages" does not match the actual packages on disk.
This probably means you recently added or removed a package.
The api-extractor.json config has been updated, you should commit this change to match your packages change.

`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
