import { join } from 'node:path';
import { Logger } from '@gitlab-org/logging';
import { isVirtualWorkspaceUri } from '@gitlab-org/fs';
import { FallbackFileAccessService } from '../fallback_file_access_service';
import { isPathContainedIn } from './utils/path_containment';
import { findIgnoredPaths } from './utils/gitignore_filter';

/**
 * Safety guard for the node-only file tools (read/write/edit/mkdir/grep).
 *
 * Replaces the previous "file must be in a git repository" gate. The security
 * boundary is path containment: the target is resolved through realPath
 * (symlink-resolved) and must stay within the resolved workspace folder.
 * `.gitignore` is additionally enforced via {@link findIgnoredPaths}.
 *
 * Virtual workspaces (`adt://`, `semanticfs://`, ...) skip all validation, as
 * before — their files are managed by the IDE and are not backed by a local FS.
 *
 * Returns the symlink-resolved (`realPath`) absolute path of the target so
 * callers (e.g. `list_dir`) can reuse it. For virtual workspaces the plain
 * `join(workspaceFolderPath, filePath)` is returned instead.
 */
export async function assertAccessibleFile(
  filePath: string,
  workspaceFolderPath: string,
  fileAccessService: FallbackFileAccessService,
  logger: Logger,
  workspaceFolderUri?: string,
): Promise<string> {
  const fullFilePath = join(workspaceFolderPath, filePath);

  if (isVirtualWorkspaceUri(workspaceFolderUri)) {
    logger.debug(`Skipping file access validation for virtual workspace: ${workspaceFolderUri}`);
    return fullFilePath;
  }

  const fullRealFilePath = await fileAccessService.realPath(fullFilePath);
  if (fullRealFilePath === '') {
    const errorMessage = `Path did not refer to a valid file or symlink: "${filePath}" could not be resolved`;
    logger.error(errorMessage);
    throw new Error(errorMessage);
  }
  logger.debug(`Path "${filePath}" resolved to "${fullRealFilePath}"`);

  // Resolve the workspace folder through realPath as well so both paths share
  // the same base when the workspace is reached through a symlink. Without this
  // the containment check would compare a resolved file path against an
  // unresolved workspace path and spuriously reject.
  const realWorkspaceFolderPath = await fileAccessService.realPath(workspaceFolderPath);
  if (realWorkspaceFolderPath === '') {
    const errorMessage = `Workspace folder path could not be resolved: "${workspaceFolderPath}"`;
    logger.error(errorMessage);
    throw new Error(errorMessage);
  }

  if (!isPathContainedIn(realWorkspaceFolderPath, fullRealFilePath)) {
    const errorMessage =
      fullFilePath !== fullRealFilePath
        ? `Path is outside the workspace folder: "${filePath}" points to "${fullRealFilePath}"`
        : `Path is outside the workspace folder: "${filePath}"`;
    logger.error(errorMessage);
    throw new Error(errorMessage);
  }

  if ((await findIgnoredPaths([fullRealFilePath])).length > 0) {
    const errorMessage = `Cannot access "${fullRealFilePath}": it is excluded by .gitignore and access to gitignored paths is intentionally disabled.`;
    logger.error(errorMessage);
    throw new Error(errorMessage);
  }

  return fullRealFilePath;
}
