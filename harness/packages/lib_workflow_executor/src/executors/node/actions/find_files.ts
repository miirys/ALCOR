/* eslint-disable max-classes-per-file -- action handler and its display formatter are colocated */
import { Injectable } from '@gitlab/needle';
import { z } from 'zod';
import { Logger, withPrefix } from '@gitlab-org/logging';
import { PlainTextResponse } from '@gitlab-org/duo-workflow-service';
import { ToolInputDisplay } from '@gitlab-lsp/workflow-api';
import { WorkflowAction } from '../clients/types';
import { RipgrepService } from '../../../services/ripgrep_service';
import {
  ToolInputFormatter,
  WorkflowActionContext,
  WorkflowActionHandler,
  WorkflowActionOf,
} from './index';

const findFilesArgsSchema = z.object({
  name_pattern: z.string(),
});

@Injectable(ToolInputFormatter, [])
export class FindFilesFormatter implements ToolInputFormatter {
  toolName = 'find_files';

  // Throws on invalid args; the dispatcher catches and falls back to generic.
  format(args: unknown): ToolInputDisplay {
    const { name_pattern: pattern } = findFilesArgsSchema.parse(args);
    return {
      tool: 'find_files',
      pattern,
    };
  }
}

export type FindFilesAction = WorkflowActionOf<'findFiles'>;

@Injectable(WorkflowActionHandler, [Logger, RipgrepService])
export class FindFilesActionHandler implements WorkflowActionHandler<FindFilesAction> {
  #logger: Logger;

  #ripgrepService: RipgrepService;

  constructor(logger: Logger, ripgrepService: RipgrepService) {
    this.#logger = withPrefix(logger, '[FindFilesActionHandler]');
    this.#ripgrepService = ripgrepService;
  }

  name = 'find_files';

  supportsVirtualWorkspace = false;

  canHandle(action: WorkflowAction): action is FindFilesAction {
    return Boolean(action.findFiles);
  }

  async execute(
    { findFiles }: FindFilesAction,
    { workspaceFolderPath }: WorkflowActionContext,
  ): Promise<PlainTextResponse> {
    const { name_pattern: namePattern } = findFiles;

    this.#logger.debug(`Finding files in "${workspaceFolderPath}" with pattern "${namePattern}"`);

    if (!(await this.#ripgrepService.isAvailable())) {
      return { response: '', error: 'find_files is unavailable: ripgrep could not be located.' };
    }

    try {
      // ripgrep enumerates files relative to the workspace folder and respects
      // .gitignore when inside a git repository (its default behaviour).
      //
      // No explicit assertAccessibleFile containment guard is needed here (unlike
      // the single-path file tools): `rg --files` only walks paths under the
      // workspace root, and `-g` glob patterns are confined to that root. Escape
      // patterns such as '../*' or an absolute '/etc/*' therefore match nothing
      // outside the workspace, so listFiles can never return a path outside it.
      const files = await this.#ripgrepService.listFiles(workspaceFolderPath, namePattern);
      return { response: files.join('\n'), error: '' };
    } catch (error) {
      this.#logger.error('find_files failed', error instanceof Error ? error : undefined);
      return { response: '', error: `${error instanceof Error ? error.message : error}` };
    }
  }
}
