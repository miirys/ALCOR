import { realpathSync, statSync } from 'node:fs';
import { isAbsolute, normalize, resolve } from 'node:path';
import { InvalidOptionArgumentError } from 'commander';

/**
 * Resolves a path to an absolute path, handling relative paths, current directory notation,
 * and already absolute paths. Ensures the path exists and is a directory
 *
 * @param inputPath - The path provided by the user (can be relative, absolute, or special like '.' or '..')
 * @param basePath - The base path to resolve relative paths against (defaults to process.cwd())
 * @returns The resolved absolute canonical path (symlinks resolved)
 * @throws InvalidOptionArgumentError if the resolved path doesn't exist or isn't a directory
 */
export function resolveCwdPath(inputPath: string, basePath: string = process.cwd()): string {
  let resolvedPath: string;

  if (isAbsolute(inputPath)) {
    resolvedPath = normalize(inputPath);
  } else {
    resolvedPath = resolve(basePath, inputPath);
  }

  ensureValidDirectory(resolvedPath);

  try {
    return realpathSync(resolvedPath);
  } catch (error) {
    if (
      error instanceof Error &&
      ['ENOENT', 'ENOTDIR'].includes((error as NodeJS.ErrnoException).code ?? '')
    ) {
      throw new InvalidOptionArgumentError(`Directory "${resolvedPath}" does not exist`);
    }
    throw error;
  }
}

/**
 * Verifies the provided path exists, and is a directory
 *
 * @throws InvalidOptionArgumentError if provided path is invalid.
 */
function ensureValidDirectory(resolvedPath: string) {
  let stats: ReturnType<typeof statSync>;
  try {
    stats = statSync(resolvedPath);
  } catch (error) {
    if (error instanceof Error && (error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new InvalidOptionArgumentError(`Directory "${resolvedPath}" does not exist`);
    }
    throw error;
  }
  if (!stats.isDirectory()) {
    throw new InvalidOptionArgumentError(`Path "${resolvedPath}" exists but is not a directory`);
  }
}
