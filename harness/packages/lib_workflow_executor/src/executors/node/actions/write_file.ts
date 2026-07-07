/* eslint-disable max-classes-per-file -- action handler and its display formatter are colocated */
import { join } from 'node:path';
import { collection, Injectable } from '@gitlab/needle';
import { z } from 'zod';
import { Logger, withPrefix } from '@gitlab-org/logging';
import { PlainTextResponse } from '@gitlab-org/duo-workflow-service';
import { FileAccessService, FileNotFoundError, fileLookupKey } from '@gitlab-org/fs';
import { ToolInputDisplay } from '@gitlab-lsp/workflow-api';
import { BareService, createFallbackService } from '@gitlab-org/core';
import { WorkflowAction } from '../clients/types';
import { assertAccessibleFile } from './assert_accessible_file';
import { FileStateTracker } from './file_state_tracker';
import {
  ToolInputFormatter,
  WorkflowActionContext,
  WorkflowActionHandler,
  WorkflowActionOf,
} from './index';

export type WriteFileAction = WorkflowActionOf<'runWriteFile'>;

const writeFileArgsSchema = z.object({
  file_path: z.string(),
  contents: z.string(),
});

@Injectable(ToolInputFormatter, [])
export class WriteFileFormatter implements ToolInputFormatter {
  toolName = 'create_file_with_contents';

  // Throws on invalid args; the dispatcher catches and falls back to generic.
  format(args: unknown): ToolInputDisplay {
    const { file_path: filepath, contents } = writeFileArgsSchema.parse(args);
    return {
      tool: 'create_file_with_contents',
      filepath,
      content: contents,
    };
  }
}

@Injectable(WorkflowActionHandler, [Logger, collection(FileAccessService)])
export class WriteFileActionHandler implements WorkflowActionHandler<WriteFileAction> {
  #logger: Logger;

  #fileAccessService: BareService<FileAccessService>;

  constructor(logger: Logger, fileAccessServices: FileAccessService[]) {
    this.#logger = withPrefix(logger, '[WriteFileActionHandler]');
    this.#fileAccessService = createFallbackService(this.#logger, fileAccessServices);
  }

  name = 'create_file_with_contents';

  canHandle(action: WorkflowAction): action is WriteFileAction {
    return Boolean(action.runWriteFile);
  }

  async execute(
    { runWriteFile }: WriteFileAction,
    {
      workspaceFolderPath,
      workspaceFolderUri,
      fileStateTracker,
      abortSignal,
    }: WorkflowActionContext,
  ): Promise<PlainTextResponse> {
    const filePath = runWriteFile.filepath;
    const fullFilePath = join(workspaceFolderPath, filePath);
    const lookupKey = fileLookupKey(workspaceFolderPath, workspaceFolderUri, filePath);

    try {
      await this.#fileAccessService.getText(lookupKey);
      const errorMessage = `File "${filePath}" already exists. Use the edit_file tool to modify existing files.`;
      this.#logger.debug(errorMessage);
      return { error: errorMessage, response: '' };
    } catch (error) {
      if (!(error instanceof FileNotFoundError)) {
        this.#logger.error(`Failed to check if file exists for: "${filePath}"`, error);
        throw error;
      }
      // File doesn't exist - continue with creation
    }

    try {
      await assertAccessibleFile(
        filePath,
        workspaceFolderPath,
        this.#fileAccessService,
        this.#logger,
        workspaceFolderUri,
      );
      this.#logger.debug(`Writing file "${filePath}"`);
      abortSignal.throwIfAborted();
      await this.#fileAccessService.writeFile(lookupKey, runWriteFile.contents);

      await this.#updateFileState(fileStateTracker, fullFilePath, filePath, lookupKey);

      return { response: 'File written successfully', error: '' };
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      this.#logger.error(`Error writing file "${fullFilePath}"`, err);
      return { error, response: '' };
    }
  }

  /**
   * Update our file state tracker now that the file has been edited, so that Duo does not need to
   * re-read the file for subsequent edits since it knows the current edited state.
   */
  async #updateFileState(
    fileStateTracker: FileStateTracker,
    fullFilePath: string,
    filePath: string,
    lookupKey: string,
  ): Promise<void> {
    try {
      const updatedContent = await this.#fileAccessService.getText(lookupKey);
      fileStateTracker.recordFileRead(fullFilePath, updatedContent);
    } catch (contentUpdateError) {
      this.#logger.warn(
        `Failed to update version cache after edit for "${filePath}"`,
        contentUpdateError,
      );
    }
  }
}
