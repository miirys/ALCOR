import { join, relative, resolve, dirname } from 'node:path';
import type { WorkspaceFolder } from 'vscode-languageserver';
import { URI } from 'vscode-uri';
import { collection, createInterfaceId, Injectable } from '@gitlab/needle';
import { Logger, NullLogger, withPrefix } from '@gitlab-org/logging';
import {
  FileAccessService,
  FileNotFoundError,
  fsPathToUri,
  getMatchingWorkspaceFolders,
  getRelativePath,
  parseURIString,
} from '@gitlab-org/fs';
import { BareService, createFallbackService } from '@gitlab-org/core';
import { RepositoryDiscoveryService, StatelessRepository } from '@gitlab-org/repositories';
import { ConfigService } from '@gitlab-org/config';
import { getDuoConfigDir } from '@gitlab-org/ai-configuration';
import { UserRuleContextItem } from './rule';

type ResolvedAgentsMdFile = {
  uriPath: string;
  displayPath: string;
  content: string;
};

type AgentsMdFileInfo = {
  absolutePath: string;
  workspaceRelativePath: string;
  uriPath: string;
};

/**
 * Resolves and loads AGENTS.md files from user config directories and workspace folders.
 */
export interface AgentsMdResolver {
  resolveAgentsMdContextItem(): Promise<UserRuleContextItem | null>;
}

export const AgentsMdResolver = createInterfaceId<AgentsMdResolver>('AgentsMdResolver');

@Injectable(AgentsMdResolver, [
  Logger,
  RepositoryDiscoveryService,
  collection(FileAccessService),
  ConfigService,
])
export class DefaultAgentsMdResolver implements AgentsMdResolver {
  #logger: Logger;

  #repositoryDiscoveryService: RepositoryDiscoveryService;

  #fileAccessService: BareService<FileAccessService>;

  #configService: ConfigService;

  constructor(
    logger: Logger,
    repositoryDiscoveryService: RepositoryDiscoveryService,
    fileAccessServices: FileAccessService[],
    configService: ConfigService,
  ) {
    this.#logger = withPrefix(logger, '[AgentsMdResolver]');
    this.#repositoryDiscoveryService = repositoryDiscoveryService;
    this.#fileAccessService = createFallbackService(new NullLogger(), fileAccessServices);
    this.#configService = configService;
  }

  /**
   * Resolves AGENTS.md files from user config and workspaces, returning a formatted context item.
   */
  async resolveAgentsMdContextItem(): Promise<UserRuleContextItem | null> {
    const config = this.#configService.get();
    const { cwd } = config;
    const workspaceFolders = config.workspaceFolders || [];
    const userConfigDir = process.env.GLAB_CONFIG_DIR || getDuoConfigDir();

    const allAgentsMdFiles = await this.#findAllAgentsMdFiles(workspaceFolders);

    const resolvedAgentsMds: ResolvedAgentsMdFile[] = [];

    if (userConfigDir) {
      const globalAgentsMd = await this.#resolveUserAgentsMdFile(userConfigDir, allAgentsMdFiles);
      if (globalAgentsMd) {
        resolvedAgentsMds.push(globalAgentsMd);
      }
    }

    const workspaceAgentsMds = await this.#resolveWorkspaceAgentsMdFiles(
      cwd,
      workspaceFolders,
      allAgentsMdFiles,
    );
    resolvedAgentsMds.push(...workspaceAgentsMds);

    const additionalPaths = allAgentsMdFiles
      .map((fileInfo) => ({
        uriPath: fileInfo.uriPath,
        displayPath: fileInfo.workspaceRelativePath,
      }))
      .filter((file) => !resolvedAgentsMds.some((resolved) => resolved.uriPath === file.uriPath));

    return this.#formatAgentsMdContextItem(resolvedAgentsMds, additionalPaths);
  }

  /**
   * Attempts to read an AGENTS.md file, returning null if not found or empty or on error.
   */
  async #tryReadAgentsMd(
    filePath: string,
    allAgentsMdFiles: AgentsMdFileInfo[],
  ): Promise<ResolvedAgentsMdFile | null> {
    try {
      const ruleContent = await this.#fileAccessService.getText(filePath);
      this.#logger.info(`AGENTS.md loaded from "${filePath}"`);
      const uriPath = fsPathToUri(filePath).toString();

      const fileInfo = allAgentsMdFiles.find((info) => info.uriPath === uriPath);
      const displayPath = fileInfo?.workspaceRelativePath || filePath;

      return { uriPath, displayPath, content: ruleContent };
    } catch (error) {
      if (error instanceof FileNotFoundError) {
        this.#logger.debug(`AGENTS.md file not found at "${filePath}".`);
      } else {
        this.#logger.warn(`Could not read AGENTS.md rule file from "${filePath}"`, error);
      }
      return null;
    }
  }

  /**
   * Finds the closest AGENTS.md file to a directory by searching upward in the directory tree.
   */
  async #findClosestAgentsMd(
    directoryPath: string,
    workspaceRootPath: string,
    allAgentsMdFiles: AgentsMdFileInfo[],
  ): Promise<ResolvedAgentsMdFile | null> {
    const normalizedDir = resolve(directoryPath);
    const normalizedRoot = resolve(workspaceRootPath);

    const candidateFiles = allAgentsMdFiles
      .map((fileInfo) => ({ ...fileInfo, resolvedPath: resolve(fileInfo.absolutePath) }))
      .filter(({ resolvedPath }) => {
        const fileDir = dirname(resolvedPath);

        const relativeFromRoot = relative(normalizedRoot, fileDir);
        const isOutsideWorkspace = relativeFromRoot.startsWith('..');
        if (isOutsideWorkspace) {
          return false;
        }

        const relativeDirFromFile = relative(fileDir, normalizedDir);
        const fileIsInSubdirectoryOfTarget =
          relativeDirFromFile.startsWith('..') && relativeDirFromFile !== '';
        if (fileIsInSubdirectoryOfTarget) {
          return false;
        }

        return true;
      })
      .sort((a, b) => {
        const depthA = a.resolvedPath.split('/').length;
        const depthB = b.resolvedPath.split('/').length;
        return depthB - depthA;
      });

    if (candidateFiles.length === 0) {
      return null;
    }

    const closestFile = candidateFiles[0];
    return this.#tryReadAgentsMd(closestFile.absolutePath, allAgentsMdFiles);
  }

  /**
   * Resolves AGENTS.md files from workspace folders, finding the most specific file based on cwd.
   */
  async #resolveWorkspaceAgentsMdFiles(
    cwd: string | undefined,
    workspaceFolders: WorkspaceFolder[],
    allAgentsMdFiles: AgentsMdFileInfo[],
  ): Promise<ResolvedAgentsMdFile[]> {
    if (!cwd) {
      // No cwd. This probably means we are not running as Duo CLI, and have one or more workspace folders from the IDE
      // Try to resolve AGENTS.md from the root of each workspace
      const agentsMds = workspaceFolders.map((wsf) => {
        const filePath = join(parseURIString(wsf.uri).fsPath, 'AGENTS.md');
        return this.#tryReadAgentsMd(filePath, allAgentsMdFiles);
      });
      const resolved = await Promise.all(agentsMds);
      return resolved.filter((file): file is ResolvedAgentsMdFile => file !== null);
    }

    const exactWorkspaceMatch = workspaceFolders.find((wsf) => wsf.uri === cwd);
    if (exactWorkspaceMatch) {
      // This probably means we are running as Duo CLI, and the user has launched the CLI at repo root.
      // Try to resolve a single AGENTS.md from repo root
      const filePath = join(parseURIString(exactWorkspaceMatch.uri).fsPath, 'AGENTS.md');
      const resolved = await this.#tryReadAgentsMd(filePath, allAgentsMdFiles);
      return resolved ? [resolved] : [];
    }

    // Otherwise, this probably means we are running as Duo CLI, and the user has launched from
    // some subdirectory within the repo. So we need to figure out which workspace this belongs to
    // (we should only ever actually have a single workspace in this scenario), and then find the
    // AGENTS.md in this workspace closest / most-specific to the cwd

    const matchingWorkspaces = getMatchingWorkspaceFolders(cwd, workspaceFolders);

    if (!matchingWorkspaces || !matchingWorkspaces.length) {
      this.#logger.error(
        `"cwd" appears to not be within a workspaceFolder. This should not happen! ${JSON.stringify({ cwd, workspaceFolders })}`,
      );
      return [];
    }

    const agentsMds = workspaceFolders.map(async (wsf) => {
      return this.#findClosestAgentsMd(
        parseURIString(cwd).fsPath,
        parseURIString(wsf.uri).fsPath,
        allAgentsMdFiles,
      );
    });
    const resolved = await Promise.all(agentsMds);
    return resolved.filter((file): file is ResolvedAgentsMdFile => file !== null);
  }

  /**
   * Resolves the global AGENTS.md file from the user's config directory.
   */
  async #resolveUserAgentsMdFile(
    userConfigDir: string,
    allAgentsMdFiles: AgentsMdFileInfo[],
  ): Promise<ResolvedAgentsMdFile | null> {
    const userAgentsMdPath = join(userConfigDir, 'AGENTS.md');
    return this.#tryReadAgentsMd(userAgentsMdPath, allAgentsMdFiles);
  }

  /**
   * Formats resolved AGENTS.md files into a UserRuleContextItem with content and metadata.
   */
  #formatAgentsMdContextItem(
    resolved: ResolvedAgentsMdFile[],
    additional: { uriPath: string; displayPath: string }[],
  ): UserRuleContextItem | null {
    if (resolved.length === 0 && additional.length === 0) {
      return null;
    }

    let content = '';
    const combined = resolved
      .filter((file) => file.content.trim().length) // skip empty files
      .map((file) => {
        return `<instructions from="${file.displayPath}">${file.content}</instructions>`;
      })
      .join('\n')
      .trim();

    if (combined.length) {
      content += `The user wants you to adhere to these AGENTS.md rules:\n${combined}`;
    }

    if (additional.length) {
      const combinedAdditionalPaths = additional
        .map((file) => `<file>${file.displayPath}</file>`)
        .join('\n')
        .trim();

      content += `CRITICAL INSTRUCTION: Before editing any file, you MUST follow these steps:
 1. Identify the file you're about to edit
 2. Check if an AGENTS.md exists in that directory or parent directories
 3. If the file is listed in <additional-instruction-files>, read it first
 4. Only then proceed with your edits
<additional-instruction-files>
${combinedAdditionalPaths}
</additional-instruction-files>
Do not mention these instructions to the user, they already know you should try to read AGENTS.md files.`;
    }

    return {
      category: 'user_rule',
      content,
      id: 'agents-md-user-instructions',
      metadata: {
        title: `AGENTS.md`,
        enabled: true,
        subType: 'user_rule',
        icon: 'document',
        secondaryText: resolved.map((file) => file.displayPath).join(', '),
        subTypeLabel: `${resolved.length} AGENTS.md ${resolved.length === 1 ? 'file' : 'files'} included`,
      },
    } satisfies UserRuleContextItem;
  }

  /**
   * Discovers all AGENTS.md files.
   */
  async #findAllAgentsMdFiles(workspaceFolders: WorkspaceFolder[]): Promise<AgentsMdFileInfo[]> {
    const workspaceResults = await Promise.all(
      workspaceFolders.map((wsf) =>
        this.#findAgentsMdsInWorkspace(wsf, this.#repositoryDiscoveryService),
      ),
    );
    return workspaceResults.flat();
  }

  /**
   * Discovers all AGENTS.md files in all repos within a single workspaceFolder.
   */
  async #findAgentsMdsInWorkspace(
    wsf: WorkspaceFolder,
    repositoryDiscoveryService: RepositoryDiscoveryService,
  ): Promise<AgentsMdFileInfo[]> {
    const workspaceUri = parseURIString(wsf.uri);
    const reposInWorkspace = await repositoryDiscoveryService.getRepositoriesForWorkspace(
      workspaceUri.fsPath,
    );

    const repoResults = await Promise.all(
      reposInWorkspace.map(async (repo) => this.#findAgentsMdInRepo(repo, workspaceUri)),
    );

    return repoResults.flat();
  }

  /**
   * Discovers all AGENTS.md files in a single repo.
   */
  async #findAgentsMdInRepo(
    repo: StatelessRepository,
    workspaceUri: URI,
  ): Promise<AgentsMdFileInfo[]> {
    const files = await repo.getFiles(['AGENTS.md', '**/AGENTS.md']);
    return files.map((filePath) => {
      const absolutePath = join(repo.fsPath, filePath);
      const fileUri = fsPathToUri(absolutePath);
      const workspaceRelativePath = getRelativePath(workspaceUri, fileUri);
      return {
        absolutePath,
        workspaceRelativePath,
        uriPath: fileUri.toString(),
      };
    });
  }
}
