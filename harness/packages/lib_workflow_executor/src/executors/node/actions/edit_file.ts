/// <reference lib="es2022" />
/* eslint-disable max-classes-per-file -- action handler and its display formatter are colocated */
import { join } from 'node:path';
import { Diagnostic, Range } from 'vscode-languageserver-protocol';
import {
  ClientFeatureFlags,
  FeatureFlagService,
  BareService,
  createFallbackService,
  detectEol,
  applyEol,
} from '@gitlab-org/core';
import { DocumentQualityService, formatDiagnostic, rangeOverlapsAny } from '@gitlab-org/document';
import { PlainTextResponse } from '@gitlab-org/duo-workflow-service';
import { FileAccessService, fileLookupKey } from '@gitlab-org/fs';
import { Logger, withPrefix } from '@gitlab-org/logging';
import { collection, Injectable } from '@gitlab/needle';
import { z } from 'zod';
import { URI } from 'vscode-uri';
import { ToolInputDisplay } from '@gitlab-lsp/workflow-api';
import { WorkflowAction } from '../clients/types';
import { createTextEditsFromContent } from './utils/text_edit_utils';
import { assertAccessibleFile } from './assert_accessible_file';
import {
  FileStateTracker,
  DuoFileNotReadError,
  DuoFileModifiedSinceLastReadError,
} from './file_state_tracker';
import {
  WorkflowActionContext,
  WorkflowActionHandler,
  WorkflowActionOf,
  ToolInputFormatContext,
  ToolInputFormatter,
} from './index';

export type EditFileAction = WorkflowActionOf<'runEditFile'>;

const editFileArgsSchema = z.object({
  file_path: z.string(),
  old_str: z.string(),
  new_str: z.string(),
});

@Injectable(ToolInputFormatter, [Logger, collection(FileAccessService)])
export class EditFileFormatter implements ToolInputFormatter {
  #logger: Logger;

  #fileAccessService: BareService<FileAccessService>;

  constructor(logger: Logger, fileAccessServices: FileAccessService[]) {
    this.#logger = withPrefix(logger, '[EditFileFormatter]');
    this.#fileAccessService = createFallbackService(this.#logger, fileAccessServices);
  }

  toolName = 'edit_file';

  // Parsing throws on invalid args; the dispatcher catches and falls back to
  // generic. A readable file that simply can't be loaded still degrades to the
  // fragment-diff display below.
  async format(
    args: unknown,
    { workspaceFolderPath }: ToolInputFormatContext,
  ): Promise<ToolInputDisplay> {
    const {
      file_path: filepath,
      old_str: oldStr,
      new_str: newStr,
    } = editFileArgsSchema.parse(args);

    try {
      // A present-but-unreadable file falls through to the fragment-diff fallback
      // below; missing/invalid args are already rejected by the schema parse above.
      const fullFilePath = join(workspaceFolderPath, filepath);
      const currentContent = await this.#fileAccessService.getText(fullFilePath);

      // This `format` method can be called at different stages, e.g. on tool approval event,
      // where the edit has not yet happened, or on tool completed event, where content has already
      // been edited. So we need to handle both scenarios for constructing diff old/new content

      // Re-encode model-supplied strings to the file's dominant EOL; see eol_utils.ts.
      const fileEol = detectEol(currentContent);
      const oldStrWithEol = applyEol(oldStr, fileEol);
      const newStrWithEol = applyEol(newStr, fileEol);

      const fileAlreadyEdited = currentContent.includes(newStrWithEol);

      let originalContent: string;
      let newContent: string;

      if (fileAlreadyEdited) {
        originalContent = currentContent.replace(newStrWithEol, oldStrWithEol);
        newContent = currentContent;
      } else {
        originalContent = currentContent;
        newContent = currentContent.replace(oldStrWithEol, newStrWithEol);
      }

      return {
        tool: 'edit_file',
        filepath,
        diff: {
          old: { filepath, content: originalContent },
          new: { filepath, content: newContent },
        },
      };
    } catch (error) {
      // Fallback to fragment diff if we can't read the file
      this.#logger.warn(`Could not read file for full diff display: ${filepath}`, error);
      return {
        tool: 'edit_file',
        filepath,
        diff: {
          old: { filepath, content: oldStr },
          new: { filepath, content: newStr },
        },
      };
    }
  }
}

@Injectable(WorkflowActionHandler, [
  Logger,
  collection(FileAccessService),
  DocumentQualityService,
  FeatureFlagService,
])
export class EditFileActionHandler implements WorkflowActionHandler<EditFileAction> {
  #logger: Logger;

  #fileAccessService: BareService<FileAccessService>;

  #documentQualityService: DocumentQualityService;

  #featureFlagService: FeatureFlagService;

  constructor(
    logger: Logger,
    fileAccessServices: FileAccessService[],
    documentQualityService: DocumentQualityService,
    featureFlagService: FeatureFlagService,
  ) {
    this.#logger = withPrefix(logger, '[EditFileActionHandler]');
    this.#fileAccessService = createFallbackService(this.#logger, fileAccessServices);
    this.#documentQualityService = documentQualityService;
    this.#featureFlagService = featureFlagService;
  }

  name = 'edit_file';

  canHandle(action: WorkflowAction): action is EditFileAction {
    return Boolean(action.runEditFile);
  }

  async execute(
    { runEditFile }: EditFileAction,
    {
      workspaceFolderPath,
      workspaceFolderUri,
      fileStateTracker,
      abortSignal,
    }: WorkflowActionContext,
  ): Promise<PlainTextResponse> {
    const filePath = runEditFile.filepath;

    // Block access to sensitive configuration directories and files
    const blockedPatterns = [
      // GitLab Duo configuration
      /(^|[/\\])\.gitlab[/\\]duo[/\\]/,
      // Git directory and configuration
      /(^|[/\\])\.git[/\\]/,
      // Eclipse metadata
      /(^|[/\\])\.metadata[/\\]/,
      // JetBrains IDE configuration
      /(^|[/\\])\.idea[/\\].*\.xml$/,
      // VS Code workspace settings
      /(^|[/\\])\.vscode[/\\]settings\.json$/,
      // Neovim configuration files
      /(^|[/\\])\.nvimrc$/,
      /(^|[/\\])\.vimrc$/,
      /(^|[/\\])init\.lua$/,
    ];

    for (const pattern of blockedPatterns) {
      if (filePath.match(pattern)) {
        return {
          error:
            'You are not allowed to change editor configuration files or sensitive directories',
          response: '',
        };
      }
    }

    const fullFilePath = join(workspaceFolderPath, filePath);
    const lookupKey = fileLookupKey(workspaceFolderPath, workspaceFolderUri, filePath);

    let originalContent = '';
    try {
      await assertAccessibleFile(
        filePath,
        workspaceFolderPath,
        this.#fileAccessService,
        this.#logger,
        workspaceFolderUri,
      );
      this.#logger.debug(`Reading file "${filePath}" for editing`);
      originalContent = await this.#fileAccessService.getText(lookupKey);
    } catch (error) {
      const errorMessage = (error as Error).message;
      this.#logger.error(`Unable to open file "${filePath}": ${errorMessage}`);
      return { error: `Unable to open file: ${errorMessage}`, response: '' };
    }

    try {
      fileStateTracker.assertFileNotModifiedSinceLastRead(
        workspaceFolderPath,
        filePath,
        originalContent,
      );
    } catch (error) {
      if (
        error instanceof DuoFileNotReadError ||
        error instanceof DuoFileModifiedSinceLastReadError
      ) {
        this.#logger.debug(`Can't edit file: "${error.message}"`);
        return { error: error.message, response: '' };
      }
      this.#logger.error(
        `Failed to verify if Duo has already read file before editing for: "${filePath}"`,
        error,
      );
    }

    // Re-encode model-supplied strings to the file's dominant EOL; see eol_utils.ts.
    const fileEol = detectEol(originalContent);
    const oldString = applyEol(runEditFile.oldString, fileEol);
    const newString = applyEol(runEditFile.newString, fileEol);

    const oldStringExists = originalContent.includes(oldString);
    if (!oldStringExists) {
      // Echo back the model's original (pre-normalized) string so the message
      // reflects exactly what was sent, not our re-encoded form.
      return {
        response: `No changes made to '${filePath}' as '${runEditFile.oldString}' not found`,
        error: '',
      };
    }

    const occurrences = originalContent.split(oldString).length - 1;
    if (occurrences > 1) {
      return {
        response: '',
        error:
          'Ambiguous match: "oldText" appears multiple times. Provide more surrounding code to make the replacement match unique.',
      };
    }

    const textEdits = createTextEditsFromContent(originalContent, oldString, newString);
    const editedRanges = textEdits.map((edit) => edit.range);

    if (textEdits.length === 0) {
      return {
        response: `No changes made to '${filePath}' as text edit range could not be determined.`,
        error: '',
      };
    }

    try {
      abortSignal.throwIfAborted();
      await this.#fileAccessService.updateFile(lookupKey, textEdits);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.#logger.error(`Error updating file "${fullFilePath}"`, error);
      return { error: errorMessage, response: '' };
    }

    await this.#updateFileState(fileStateTracker, fullFilePath, filePath, lookupKey);

    const isDiagnosticsFeatureFlagEnabled = this.#featureFlagService.isClientFlagEnabled(
      ClientFeatureFlags.EditFileDiagnosticsResponse,
    );
    if (!isDiagnosticsFeatureFlagEnabled) {
      return { response: `File '${filePath}' has been updated.`, error: '' };
    }

    return this.#getResponse(filePath, lookupKey, editedRanges);
  }

  async #getResponse(
    filePath: string,
    lookupKey: string,
    editedRanges: Range[],
  ): Promise<PlainTextResponse> {
    let diagnostics: Diagnostic[] = [];
    try {
      diagnostics = await this.#documentQualityService.getDiagnostics(URI.parse(lookupKey));
    } catch (err) {
      this.#logger.error(
        `Failed to get IDE diagnostics for "${filePath}", tool response will omit this`,
        err,
      );
    }

    const relevantDiagnostics = diagnostics.filter((d) => {
      return rangeOverlapsAny(d.range, editedRanges);
    });

    let response = `File '${filePath}' has been updated.`;
    if (relevantDiagnostics.length) {
      const pluralisedIssues = relevantDiagnostics.length > 1 ? 'issues' : 'issue';
      const formattedDiagnostics = relevantDiagnostics
        .map((d) => `* ${formatDiagnostic(d)}`)
        .join('\n');

      response += ` IDE reported ${relevantDiagnostics.length} diagnostic ${pluralisedIssues} in the edited range which may require additional changes to fix:\n${formattedDiagnostics}`;
    }

    this.#logger.debug(response);
    return { response, error: '' };
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
