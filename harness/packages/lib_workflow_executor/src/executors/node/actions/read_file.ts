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
  sliceFileContent,
  buildPaginationMessage,
  MAX_FILE_SIZE_MB,
  MAX_FILE_SIZE_BYTES,
} from './utils/file_slicing';
import {
  ToolInputFormatter,
  WorkflowActionContext,
  WorkflowActionHandler,
  WorkflowActionOf,
} from './index';

export type ReadFileAction = WorkflowActionOf<'runReadFile'>;

const readFileArgsSchema = z.object({
  file_path: z.string(),
  offset: z.number().optional(),
  limit: z.number().optional(),
});

@Injectable(ToolInputFormatter, [])
export class ReadFileFormatter implements ToolInputFormatter {
  toolName = 'read_file';

  // Throws on invalid args; the dispatcher catches and falls back to generic.
  format(args: unknown): ToolInputDisplay {
    const { file_path: filepath, offset, limit } = readFileArgsSchema.parse(args);
    return {
      tool: 'read_file',
      filepath,
      ...(offset != null && { offset }),
      ...(limit != null && { limit }),
    };
  }
}

@Injectable(WorkflowActionHandler, [Logger, collection(FileAccessService), FsClient, ConfigService])
export class ReadFileActionHandler
  extends BaseFileReader
  implements WorkflowActionHandler<ReadFileAction>
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
    super(withPrefix(logger, '[ReadFileActionHandler]'));
    this.#fileAccessService = createFallbackService(this.logger, fileAccessServices);
    this.#fsClient = fsClient;
    this.#configService = configService;
  }

  name = 'read_file';

  canHandle(action: WorkflowAction): action is ReadFileAction {
    return Boolean(action.runReadFile);
  }

  async execute(
    { runReadFile }: ReadFileAction,
    { workspaceFolderPath, workspaceFolderUri, fileStateTracker }: WorkflowActionContext,
  ): Promise<PlainTextResponse> {
    const requestedPath = runReadFile.filepath;

    this.logger.debug(`Reading file "${requestedPath}"`);

    let wsPath = workspaceFolderPath;
    let wsUri = workspaceFolderUri;
    let filePath = requestedPath;

    if (isAbsolute(requestedPath)) {
      const resolved = await this.resolveAbsolutePath(
        requestedPath,
        [{ uri: workspaceFolderUri }, ...(this.#configService.get().workspaceFolders ?? [])],
        (p) => this.#fileAccessService.realPath(p),
      );

      // Outside every workspace folder, only global trusted dirs (skills, Duo config) are readable; those bypass FileStateTracker.
      if (resolved.trusted) {
        const trustedRead = await readTrustedFile(
          requestedPath,
          this.#fileAccessService,
          this.#fsClient,
          this.logger,
        );
        if (trustedRead.error) {
          return { response: '', error: trustedRead.error };
        }
        const sliced = sliceFileContent(
          trustedRead.content ?? '',
          runReadFile.offset,
          runReadFile.limit,
        );
        return { response: sliced.content + buildPaginationMessage(sliced), error: '' };
      }

      wsPath = resolved.wsPath;
      wsUri = resolved.wsUri;
      filePath = resolved.filePath;
    }

    const fullFilePath = join(wsPath, filePath);

    try {
      await assertAccessibleFile(filePath, wsPath, this.#fileAccessService, this.logger, wsUri);

      const isVirtualWorkspace = isVirtualWorkspaceUri(wsUri);
      if (!isVirtualWorkspace) {
        if (await isBinaryFile(fsPathToUri(fullFilePath), this.#fsClient)) {
          this.logger.debug(`File "${filePath}" detected as binary, skipping read`);
          return { response: '', error: `Cannot read file: "${requestedPath}" is a binary file` };
        }

        const stat = await this.#fsClient.promises.stat(fullFilePath);
        if (stat.size > MAX_FILE_SIZE_BYTES) {
          const sizeMB = (stat.size / (1024 * 1024)).toFixed(1);
          return {
            response: '',
            error: `File size (${sizeMB} MB) exceeds the ${MAX_FILE_SIZE_MB} MB limit: "${requestedPath}"`,
          };
        }
      }

      const lookupKey = fileLookupKey(wsPath, wsUri, filePath);

      const fileContent = await this.#fileAccessService.getText(lookupKey);

      this.updateFileState(fileContent, fileStateTracker, fullFilePath, filePath);

      const result = sliceFileContent(fileContent, runReadFile.offset, runReadFile.limit);
      const response = result.content + buildPaginationMessage(result);

      return { response, error: '' };
    } catch (error) {
      this.logger.error(`Error reading file "${fullFilePath}"`, error);
      const fsError = error as NodeJS.ErrnoException;
      if (fsError.code === 'ENOENT') {
        return { response: '', error: `File not found: "${requestedPath}"` };
      }
      const errorMessage = error instanceof Error ? error.message : String(error);
      return { response: '', error: `Error reading file: ${errorMessage}` };
    }
  }
}
