import { resolve } from 'node:path';
import { Logger, withPrefix } from '@gitlab-org/logging';
import { FsClient, fsPathToUri, isBinaryFile } from '@gitlab-org/fs';
import { getTrustedReadableDirectories } from '@gitlab-org/ai-configuration';
import { FallbackFileAccessService } from '../fallback_file_access_service';
import { MAX_FILE_SIZE_BYTES, MAX_FILE_SIZE_MB } from './utils/file_slicing';
import { isPathContainedIn } from './utils/path_containment';

export interface TrustedFileReadResult {
  content?: string;
  error?: string;
}

export async function readTrustedFile(
  filePath: string,
  fileAccessService: FallbackFileAccessService,
  fsClient: FsClient,
  logger: Logger,
): Promise<TrustedFileReadResult> {
  const log = withPrefix(logger, '[TrustedFileReader]');
  const normalizedPath = resolve(filePath);
  const trustedDirs = getTrustedReadableDirectories().map((dir) => resolve(dir));
  // canonical form lets containment succeed when the trusted dir itself is a symlink (common dotfile pattern).
  const canonicalTrustedDirs = await Promise.all(
    trustedDirs.map(async (dir) => (await fileAccessService.realPath(dir)) || dir),
  );
  const isContainedIn = (dirs: string[], p: string) =>
    dirs.some((dir) => isPathContainedIn(dir, p));

  if (!isContainedIn(trustedDirs, normalizedPath)) {
    log.warn(`Denied read of untrusted absolute path: "${filePath}"`);
    return {
      error: `Access denied: "${filePath}" is outside the repository and not in a trusted directory`,
    };
  }

  log.debug(`Reading trusted file "${filePath}"`);

  try {
    const realPath = await fileAccessService.realPath(normalizedPath);
    if (realPath === '') {
      log.debug(`realPath returned empty for "${normalizedPath}"; cannot resolve`);
      return { error: `Cannot resolve path: "${filePath}"` };
    }

    if (!isContainedIn(canonicalTrustedDirs, realPath)) {
      log.warn(
        `Denied read: "${filePath}" resolves to "${realPath}" which is outside trusted directories`,
      );
      return {
        error: `Access denied: "${filePath}" resolves to a path outside trusted directories`,
      };
    }

    if (await isBinaryFile(fsPathToUri(realPath), fsClient)) {
      log.debug(`Trusted file is binary, skipping read: "${filePath}"`);
      return { error: `Cannot read file: "${filePath}" is a binary file` };
    }

    const stat = await fsClient.promises.stat(realPath);
    if (stat.size > MAX_FILE_SIZE_BYTES) {
      const sizeMB = (stat.size / (1024 * 1024)).toFixed(1);
      return {
        error: `File size (${sizeMB} MB) exceeds the ${MAX_FILE_SIZE_MB} MB limit: "${filePath}"`,
      };
    }

    const content = await fileAccessService.getText(realPath);
    return { content };
  } catch (error) {
    log.error(`Error reading trusted file "${filePath}"`, error);
    const fsError = error as NodeJS.ErrnoException;
    if (fsError.code === 'ENOENT') {
      return { error: `File not found: "${filePath}"` };
    }
    const errorMessage = error instanceof Error ? error.message : String(error);
    return { error: `Error reading file: ${errorMessage}` };
  }
}
