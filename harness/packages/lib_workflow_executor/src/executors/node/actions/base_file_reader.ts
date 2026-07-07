import { relative } from 'node:path';
import { Logger } from '@gitlab-org/logging';
import { FileStateTracker } from './file_state_tracker';
import { findContainingWorkspaceFolder } from './workspace_folder_resolver';

/** `trusted` = path is outside every workspace folder (use the trusted-directory reader); otherwise the resolved folder + relative path. */
export type ResolvedAbsolutePath =
  | { trusted: true }
  | { trusted: false; wsPath: string; wsUri: string; filePath: string };

/**
 * Base class for file reading action handlers that need to track file state.
 */
export abstract class BaseFileReader {
  protected logger: Logger;

  constructor(logger: Logger) {
    this.logger = logger;
  }

  /** Resolves an absolute path to its containing workspace folder, or signals it falls outside every folder (caller falls back to the trusted-directory reader). */
  protected async resolveAbsolutePath(
    requestedPath: string,
    candidateFolders: readonly { uri: string }[],
    realPath: (p: string) => Promise<string>,
  ): Promise<ResolvedAbsolutePath> {
    const containing = await findContainingWorkspaceFolder(
      requestedPath,
      candidateFolders,
      realPath,
    );

    if (!containing) {
      this.logger.debug(
        `Absolute path "${requestedPath}" is outside all workspace folders; using trusted-directory reader`,
      );
      return { trusted: true };
    }

    this.logger.debug(
      `Absolute path "${requestedPath}" resolved to workspace folder "${containing.path}"`,
    );
    return {
      trusted: false,
      wsPath: containing.path,
      wsUri: containing.uri,
      filePath: relative(containing.path, requestedPath),
    };
  }

  protected updateFileState(
    content: string,
    fileStateTracker: FileStateTracker,
    fullFilePath: string,
    filePath: string,
  ): void {
    try {
      fileStateTracker.recordFileRead(fullFilePath, content);
    } catch (contentUpdateError) {
      this.logger.warn(
        `Failed to update version cache after reading for "${filePath}"`,
        contentUpdateError,
      );
    }
  }
}
