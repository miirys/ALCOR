/* eslint-disable max-classes-per-file -- action handler and its display formatter are colocated */
import { isAbsolute, join } from 'node:path';
import { collection, Injectable } from '@gitlab/needle';
import { z } from 'zod';
import { Logger, withPrefix } from '@gitlab-org/logging';
import { ConfigService } from '@gitlab-org/config';
import { PlainTextResponse } from '@gitlab-org/duo-workflow-service';
import {
  FileAccessService,
  FsClient,
  fileLookupKey,
  fsPathToUri,
  isBinaryFile,
  isVirtualWorkspaceUri,
} from '@gitlab-org/fs';
import { ToolInputDisplay } from '@gitlab-lsp/workflow-api';
import { BareService, createFallbackService } from '@gitlab-org/core';
import { WorkflowAction } from '../clients/types';
import { assertAccessibleFile } from './assert_accessible_file';
import { BaseFileReader } from './base_file_reader';
import { readTrustedFile } from './trusted_file_reader';
import {
  ToolInputFormatter,
  WorkflowActionContext,
  WorkflowActionHandler,
  WorkflowActionOf,
} from './index';

const readFilesArgsSchema = z.object({
  file_paths: z.array(z.string()),
});

@Injectable(ToolInputFormatter, [])
export class ReadFilesFormatter implements ToolInputFormatter {
  toolName = 'read_files';

  // Throws on invalid args; the dispatcher catches and falls back to generic.
  format(args: unknown): ToolInputDisplay {
    const { file_paths: filepaths } = readFilesArgsSchema.parse(args);
    return {
      tool: 'read_files',
      filepaths,
    };
  }
}

interface FileResult {
  content?: string;
  error?: string;
}

export type ReadFilesAction = WorkflowActionOf<'runReadFiles'>;

@Injectable(WorkflowActionHandler, [Logger, collection(FileAccessService), FsClient, ConfigService])
export class ReadFilesActionHandler
  extends BaseFileReader
  implements WorkflowActionHandler<ReadFilesAction>
{
  #fileAccessService: BareService<FileAccessService>;

  #fsClient: FsClient;

  #configService: ConfigService;

  constructor(
    logger: Logger,
    fileAccessServices: FileAccessService[],
    fsClient: FsClient,
    configService: ConfigService,
  ) {
    super(withPrefix(logger, '[ReadFilesActionHandler]'));
    this.#fileAccessService = createFallbackService(this.logger, fileAccessServices);
    this.#fsClient = fsClient;
    this.#configService = configService;
  }

  name = 'read_files';

  canHandle(action: WorkflowAction): action is ReadFilesAction {
    return Boolean(action.runReadFiles);
  }

  async execute(
    { runReadFiles }: ReadFilesAction,
    { workspaceFolderPath, workspaceFolderUri, fileStateTracker }: WorkflowActionContext,
  ): Promise<PlainTextResponse> {
    const filePaths = runReadFiles.filepaths;
    const results: Record<string, FileResult> = {};
    const candidateFolders = [
      { uri: workspaceFolderUri },
      ...(this.#configService.get().workspaceFolders ?? []),
    ];

    await Promise.allSettled(
      filePaths.map(async (requestedPath) => {
        let wsPath = workspaceFolderPath;
        let wsUri = workspaceFolderUri;
        let filePath = requestedPath;

        if (isAbsolute(requestedPath)) {
          const resolved = await this.resolveAbsolutePath(requestedPath, candidateFolders, (p) =>
            this.#fileAccessService.realPath(p),
          );

          // Outside every workspace folder, only global trusted dirs (skills, Duo config) are readable; those bypass FileStateTracker.
          if (resolved.trusted) {
            const trustedRead = await readTrustedFile(
              requestedPath,
              this.#fileAccessService,
              this.#fsClient,
              this.logger,
            );
            results[requestedPath] = trustedRead.error
              ? { error: trustedRead.error }
              : { content: trustedRead.content };
            return;
          }

          wsPath = resolved.wsPath;
          wsUri = resolved.wsUri;
          filePath = resolved.filePath;
        }

        const fullFilePath = join(wsPath, filePath);
        const lookupKey = fileLookupKey(wsPath, wsUri, filePath);

        try {
          await assertAccessibleFile(filePath, wsPath, this.#fileAccessService, this.logger, wsUri);

          if (
            !isVirtualWorkspaceUri(wsUri) &&
            (await isBinaryFile(fsPathToUri(fullFilePath), this.#fsClient))
          ) {
            this.logger.debug(`File "${filePath}" detected as binary, skipping read`);
            results[requestedPath] = {
              error: `Cannot read file: "${requestedPath}" is a binary file`,
            };
            return;
          }

          const content = await this.#fileAccessService.getText(lookupKey);
          results[requestedPath] = { content };
          this.updateFileState(content, fileStateTracker, fullFilePath, filePath);
          this.logger.debug(`Successfully read file "${filePath}"`);
        } catch (error) {
          this.logger.error(`Error reading file "${fullFilePath}"`, error);
          const fsError = error as NodeJS.ErrnoException;
          if (fsError.code === 'ENOENT') {
            results[requestedPath] = { error: `File not found: "${requestedPath}"` };
            return;
          }
          const errorMessage = error instanceof Error ? error.message : String(error);
          results[requestedPath] = { error: `Error reading file: ${errorMessage}` };
        }
      }),
    );

    const response = JSON.stringify(results);
    return { response, error: '' };
  }
}
