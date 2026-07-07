/* eslint-disable max-classes-per-file -- action handler and its display formatter are colocated */
import { promises as fs } from 'node:fs';
import { join, sep } from 'node:path';
import { collection, Injectable } from '@gitlab/needle';
import { z } from 'zod';
import { Logger, withPrefix } from '@gitlab-org/logging';
import { FileAccessService } from '@gitlab-org/fs';
import { PlainTextResponse } from '@gitlab-org/duo-workflow-service';
import { ToolInputDisplay } from '@gitlab-lsp/workflow-api';
import { BareService, createFallbackService } from '@gitlab-org/core';
import { WorkflowAction } from '../clients/types';
import { findIgnoredPaths } from './utils/gitignore_filter';
import { assertAccessibleFile } from './assert_accessible_file';
import {
  ToolInputFormatter,
  WorkflowActionContext,
  WorkflowActionHandler,
  WorkflowActionOf,
} from './index';

export type ListDirectoryAction = WorkflowActionOf<'listDirectory'>;

const listDirectoryArgsSchema = z.object({
  directory: z.string(),
});

@Injectable(ToolInputFormatter, [])
export class ListDirectoryFormatter implements ToolInputFormatter {
  toolName = 'list_dir';

  // Throws on invalid args; the dispatcher catches and falls back to generic.
  format(args: unknown): ToolInputDisplay {
    const { directory } = listDirectoryArgsSchema.parse(args);
    return {
      tool: 'list_dir',
      directory,
    };
  }
}

@Injectable(WorkflowActionHandler, [Logger, collection(FileAccessService)])
export class ListDirectoryActionHandler implements WorkflowActionHandler<ListDirectoryAction> {
  #logger: Logger;

  #fileAccessService: BareService<FileAccessService>;

  constructor(logger: Logger, fileAccessServices: FileAccessService[]) {
    this.#logger = withPrefix(logger, '[ListDirectoryActionHandler]');
    this.#fileAccessService = createFallbackService(this.#logger, fileAccessServices);
  }

  name = 'list_dir';

  supportsVirtualWorkspace = false;

  canHandle(action: WorkflowAction): action is ListDirectoryAction {
    return Boolean(action.listDirectory);
  }

  async execute(
    { listDirectory }: ListDirectoryAction,
    { workspaceFolderPath }: WorkflowActionContext,
  ): Promise<PlainTextResponse> {
    this.#logger.debug(
      `Listing contents in directory "${join(workspaceFolderPath, listDirectory.directory)}"`,
    );

    let realDirPath: string;
    try {
      // Shared guard: realpath resolution, workspace containment and the
      // .gitignore check on the directory itself. Returns the resolved real path.
      realDirPath = await assertAccessibleFile(
        listDirectory.directory,
        workspaceFolderPath,
        this.#fileAccessService,
        this.#logger,
      );
    } catch (error) {
      return { error: error instanceof Error ? error.message : `${error}`, response: '' };
    }

    try {
      const dirEntries = await fs.readdir(realDirPath, { withFileTypes: true });
      // Every entry comes from `readdir(realDirPath)`, so derive each absolute
      // path from the already-resolved `realDirPath` rather than `de.parentPath`
      // (which requires Node >= 20.12 and would couple us to that version).
      const absPaths = dirEntries.map((de) => join(realDirPath, de.name));
      const ignored = new Set(await findIgnoredPaths(absPaths));

      const result = dirEntries
        .filter((de) => !ignored.has(join(realDirPath, de.name)))
        .map((de) => `${de.name}${de.isDirectory() ? sep : ''}`);

      const response = result.join('\n');
      return { response, error: '' };
    } catch (error) {
      const errorMsg = `Failed to read directory "${realDirPath}": ${error}`;
      this.#logger.error(errorMsg, error instanceof Error ? error : undefined);
      return { error: errorMsg, response: '' };
    }
  }
}
