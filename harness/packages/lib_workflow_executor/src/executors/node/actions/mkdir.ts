/* eslint-disable max-classes-per-file -- action handler and its display formatter are colocated */
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { collection, Injectable } from '@gitlab/needle';
import { z } from 'zod';
import { Logger, withPrefix } from '@gitlab-org/logging';
import { FileAccessService } from '@gitlab-org/fs';
import { PlainTextResponse } from '@gitlab-org/duo-workflow-service';
import { ToolInputDisplay } from '@gitlab-lsp/workflow-api';
import { BareService, createFallbackService } from '@gitlab-org/core';
import { WorkflowAction } from '../clients/types';
import { assertAccessibleFile } from './assert_accessible_file';
import {
  ToolInputFormatter,
  WorkflowActionContext,
  WorkflowActionHandler,
  WorkflowActionOf,
} from './index';

export type MakeDirectoryAction = WorkflowActionOf<'mkdir'>;

const mkdirArgsSchema = z.object({
  directory_path: z.string(),
});

@Injectable(ToolInputFormatter, [])
export class MakeDirectoryFormatter implements ToolInputFormatter {
  toolName = 'mkdir';

  // Throws on invalid args; the dispatcher catches and falls back to generic.
  format(args: unknown): ToolInputDisplay {
    const { directory_path: path } = mkdirArgsSchema.parse(args);
    return {
      tool: 'mkdir',
      path,
    };
  }
}

@Injectable(WorkflowActionHandler, [Logger, collection(FileAccessService)])
export class MakeDirectoryActionHandler implements WorkflowActionHandler<MakeDirectoryAction> {
  #logger: Logger;

  #fileAccessService: BareService<FileAccessService>;

  constructor(logger: Logger, fileAccessServices: FileAccessService[]) {
    this.#logger = withPrefix(logger, '[MakeDirectoryActionHandler]');
    this.#fileAccessService = createFallbackService(this.#logger, fileAccessServices);
  }

  name = 'mkdir';

  supportsVirtualWorkspace = false;

  canHandle(action: WorkflowAction): action is MakeDirectoryAction {
    return Boolean(action.mkdir);
  }

  async execute(
    action: MakeDirectoryAction,
    { workspaceFolderPath, abortSignal }: WorkflowActionContext,
  ): Promise<PlainTextResponse> {
    const { directory_path: directoryPath } = action.mkdir;
    const fullDirectoryPath = join(workspaceFolderPath, directoryPath);

    try {
      await assertAccessibleFile(
        directoryPath,
        workspaceFolderPath,
        this.#fileAccessService,
        this.#logger,
      );

      this.#logger.debug(`Creating directory "${directoryPath}"`);

      abortSignal.throwIfAborted();
      await mkdir(fullDirectoryPath, { recursive: true });

      return { response: `Directory created successfully: "${directoryPath}"`, error: '' };
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      this.#logger.error(`Unable to create directory "${fullDirectoryPath}"`, err);
      return { error, response: '' };
    }
  }
}
