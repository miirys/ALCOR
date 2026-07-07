/* eslint-disable max-classes-per-file -- action handler and its display formatter are colocated */
import { join } from 'node:path';
import { collection, Injectable } from '@gitlab/needle';
import { z } from 'zod';
import { FileAccessService, isVirtualWorkspaceUri } from '@gitlab-org/fs';
import { Logger, withPrefix } from '@gitlab-org/logging';
import { GrepResult } from '@gitlab-org/repositories';
import { PlainTextResponse } from '@gitlab-org/duo-workflow-service';
import { ToolInputDisplay } from '@gitlab-lsp/workflow-api';
import { BareService, createFallbackService } from '@gitlab-org/core';
import { WorkflowAction } from '../clients/types';
import { CodeSnippetRanker } from '../../../code_insights/ranking';
import { RipgrepService } from '../../../services/ripgrep_service';
import { assertAccessibleFile } from './assert_accessible_file';
import {
  ToolInputFormatter,
  WorkflowActionContext,
  WorkflowActionHandler,
  WorkflowActionOf,
} from './index';

// ui_chat_log uses 'keywords' while the gRPC Action contract uses 'pattern'; at
// least one must be present for a meaningful display.
const grepArgsSchema = z
  .object({
    pattern: z.string().optional(),
    keywords: z.string().optional(),
    search_directory: z.string().optional(),
    case_insensitive: z.boolean().optional(),
  })
  .refine((args) => args.pattern != null || args.keywords != null, {
    message: 'Either "pattern" or "keywords" must be provided',
  });

@Injectable(ToolInputFormatter, [])
export class GrepFormatter implements ToolInputFormatter {
  toolName = 'grep';

  // Throws on invalid args; the dispatcher catches and falls back to generic.
  format(args: unknown): ToolInputDisplay {
    const {
      pattern,
      keywords,
      search_directory: directory,
      case_insensitive: caseInsensitive,
    } = grepArgsSchema.parse(args);
    return {
      tool: 'grep',
      pattern: (pattern ?? keywords) as string,
      directory,
      caseInsensitive,
    };
  }
}

export type GrepAction = WorkflowActionOf<'grep'>;

const MAX_GREP_COUNT_FILE = 5;
const MAX_SNIPPET_LENGTH = 5000;

interface Snippet {
  path: string;
  startLine: number;
  endLine: number;
  lines: string[];
}

interface GrepMatch {
  line: number;
  path: string;
  preview: string;
}

type GrepIndexLines = Map<string, GrepMatch[]>;

@Injectable(WorkflowActionHandler, [
  Logger,
  collection(FileAccessService),
  CodeSnippetRanker,
  RipgrepService,
])
export class GrepActionHandler implements WorkflowActionHandler<GrepAction> {
  #logger: Logger;

  #fileAccessService: BareService<FileAccessService>;

  #codeSnippetRanker: CodeSnippetRanker;

  #ripgrepService: RipgrepService;

  constructor(
    logger: Logger,
    fileAccessServices: FileAccessService[],
    ranker: CodeSnippetRanker,
    ripgrepService: RipgrepService,
  ) {
    this.#logger = withPrefix(logger, '[GrepActionHandler]');
    this.#fileAccessService = createFallbackService(logger, fileAccessServices);
    this.#codeSnippetRanker = ranker;
    this.#ripgrepService = ripgrepService;
  }

  name = 'grep';

  supportsVirtualWorkspace = false;

  canHandle(action: WorkflowAction): action is GrepAction {
    return Boolean(action.grep);
  }

  async execute(
    { grep }: GrepAction,
    { workspaceFolderPath, workspaceFolderUri }: WorkflowActionContext,
  ): Promise<PlainTextResponse> {
    if (isVirtualWorkspaceUri(workspaceFolderUri)) {
      return {
        response: '',
        error:
          'grep is not supported for virtual filesystem workspaces. The workspace files are managed by the IDE and are not backed by a local git repository.',
      };
    }

    // A missing/empty search directory targets the workspace root. Use the same
    // value for the guard and the search so the guard validates exactly what is
    // searched.
    const searchDirectory = grep.search_directory || '.';

    try {
      // Containment + .gitignore guard on the search directory (path-escape and
      // .gitignored directories are rejected here).
      await assertAccessibleFile(
        searchDirectory,
        workspaceFolderPath,
        this.#fileAccessService,
        this.#logger,
        workspaceFolderUri,
      );

      if (!(await this.#ripgrepService.isAvailable())) {
        return { response: '', error: 'grep is unavailable: ripgrep could not be located.' };
      }

      const searchTerms = grep.pattern.split(',');
      const grepParams = {
        searchQuery: searchTerms,
        // Search directory is workspace-relative; ripgrep is rooted at the workspace folder.
        searchDirectory,
        caseInsensitive: grep.case_insensitive,
        maxCountFile: MAX_GREP_COUNT_FILE,
      };

      this.#logger.debug(
        `ripgrep for "${grep.pattern}" — searching in workspace="${workspaceFolderPath}", searchDirectory="${grepParams.searchDirectory}", fullSearchPath="${join(workspaceFolderPath, grepParams.searchDirectory)}"`,
      );
      // Paths in the result are already workspace-relative.
      const grepResult = await this.#ripgrepService.grep(workspaceFolderPath, grepParams);
      const grepIndexLines = this.#buildGrepIndexLines(grepResult);
      const snippets = this.#buildSnippets(grepIndexLines);
      this.#logger.debug(
        `ripgrep for "${grep.pattern}" — before ranking: ${snippets.length} snippets across ${grepResult.paths.size} files`,
      );

      const totalSnippets = snippets.length;
      const totalFiles = grepResult.paths.size;
      const rankedSnippets = await this.#codeSnippetRanker.rank(snippets, searchTerms, 100);

      const response = this.#formatSnippets(
        rankedSnippets.map(([s]) => s),
        totalSnippets,
        totalFiles,
      );

      // Response not logged as it can contain sensitive values
      const fileCount = new Set(rankedSnippets.map(([s]) => s.path)).size;
      this.#logger.debug(
        `ripgrep for "${grep.pattern}" — after ranking: ${rankedSnippets.length} snippets across ${fileCount} files`,
      );
      this.#logger.debug('======');

      return { response, error: '' };
    } catch (error) {
      this.#logger.error(
        'ripgrep command execution error',
        error instanceof Error ? error : undefined,
      );
      return { response: '', error: `${error instanceof Error ? error.message : error}` };
    }
  }

  #buildGrepIndexLines(result: GrepResult): GrepIndexLines {
    const seenLines = new Set<string>();
    const matchesPerFile = new Map<string, GrepMatch[]>();

    for (const matches of Object.values(result.results)) {
      for (const match of matches) {
        const indexKey = `${match.path}:${match.line}`;

        if (!seenLines.has(indexKey)) {
          seenLines.add(indexKey);
          const lines = matchesPerFile.get(match.path) ?? [];
          lines.push(match);
          matchesPerFile.set(match.path, lines);
        }
      }
    }

    return matchesPerFile;
  }

  #buildSnippets(grepMatchesIndex: GrepIndexLines): Snippet[] {
    const snippets: Snippet[] = [];

    for (const [filePath, matches] of grepMatchesIndex) {
      // Sort matches by line number
      matches.sort((a, b) => a.line - b.line);

      const firstMatch = matches[0];
      if (firstMatch) {
        let currentSnippet: Snippet = {
          path: filePath,
          startLine: firstMatch.line,
          endLine: firstMatch.line,
          lines: [firstMatch.preview],
        };

        for (let i = 1; i < matches.length; i++) {
          const prevMatch = matches[i - 1];
          const currentMatch = matches[i];
          if (prevMatch && currentMatch) {
            if (currentMatch.line - prevMatch.line === 1) {
              // Consecutive line - add to current snippet
              currentSnippet.endLine = currentMatch.line;
              currentSnippet.lines.push(currentMatch.preview);
            } else {
              // Gap detected - save current snippet and start a new one
              snippets.push(currentSnippet);
              currentSnippet = {
                path: filePath,
                startLine: currentMatch.line,
                endLine: currentMatch.line,
                lines: [currentMatch.preview],
              };
            }
          }
        }

        // Add the last snippet
        snippets.push(currentSnippet);
      }
    }

    return snippets;
  }

  #formatSnippets(snippets: Snippet[], totalMatches: number, totalFiles: number): string {
    if (totalMatches === 0) {
      return 'No matches found.\n';
    }

    const limit = snippets.length;
    const truncated = totalMatches > limit;
    const fileWord = totalFiles === 1 ? 'file' : 'files';
    const prefix = `Found ${totalMatches} match${totalMatches === 1 ? '' : 'es'} across ${totalFiles} ${fileWord}${truncated ? ` (showing first ${limit})` : ''}\n`;

    const snippetsFormatted: string[] = [];

    for (const snippet of snippets) {
      // ripgrep already returns workspace-relative paths.
      const metadata = `${snippet.path}:${snippet.startLine}_${snippet.endLine}`;
      let content = snippet.lines.join('\n');
      if (content.length > MAX_SNIPPET_LENGTH) {
        content = `${content.slice(0, MAX_SNIPPET_LENGTH)}... (trimmed)`;
      }

      snippetsFormatted.push(`${metadata}\n${content}`);
    }

    const body = `${snippetsFormatted.join('\n')}\n`;
    const suffix = truncated
      ? `(Results truncated: showing ${limit} of ${totalMatches} matches (${totalMatches - limit} hidden). Consider using a more specific path or pattern.)\n`
      : '';

    return `${prefix}${body}${suffix}`;
  }
}
