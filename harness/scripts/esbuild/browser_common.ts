import * as esbuild from 'esbuild';
import { readdirSync } from 'fs';
import { join } from 'path';
import { wasmEntryPoints, build, pathImportPlugin } from './helpers';

function findTypeScriptFiles(dir: string): string[] {
  return readdirSync(dir, { recursive: true })
    .filter((file): file is string => typeof file === 'string' && file.endsWith('.ts'))
    .map((file) => join(dir, file));
}

export async function buildLanguageServer(): Promise<void> {
  await build({
    entryPoints: [
      ...wasmEntryPoints('browser'),
      { in: 'src/browser/main.ts', out: 'browser/main-bundle' },
    ],
    external: ['fs'],
    alias: {
      path: 'path-browserify',
    },
    platform: 'browser',
    plugins: [pathImportPlugin],
    target: 'es2020',
  });
}

export async function buildBrowserE2ETests(testDir: string, outputDir: string): Promise<void> {
  const tsFiles = findTypeScriptFiles(testDir);

  if (tsFiles.length === 0) {
    throw new Error(`No TypeScript files found in ${testDir}`);
  }

  const testConfig: esbuild.BuildOptions = {
    entryPoints: tsFiles,
    outdir: outputDir,
    format: 'esm',
    target: 'es2020',
    platform: 'browser',
    alias: {
      path: 'path-browserify',
    },
    external: ['fs'],
    sourcemap: true,
    bundle: true,
    logLevel: 'info',
  };

  await esbuild.build(testConfig);
}
