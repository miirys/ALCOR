import { basename, join, relative } from 'node:path';
import { filter } from 'fuzzaldrin-plus';
import { URI } from 'vscode-uri';
import { Injectable } from '@gitlab/needle';
import { Logger, withPrefix } from '@gitlab-org/logging';
import {
  AbstractAIContextProvider,
  AIContextProvider,
  BINARY_FILE_DISABLED_REASON,
  DuoChatAIRequest,
  LocalFileAIContextItem,
} from '@gitlab-org/ai-context';
import { ConfigService } from '@gitlab-org/config';
import { asyncDebounce } from '@gitlab-org/core';
import { DuoFeature } from '@gitlab-org/duo-feature-access';
import { FsClient, isBinaryFile } from '@gitlab-org/fs';
import { RepositoryDiscoveryService } from '@gitlab-org/repositories';
import { ParsedCliInput } from '../parse';

type SearchFn = (query: DuoChatAIRequest) => Promise<LocalFileAIContextItem[]>;

const MAX_RESULTS = 10;

type WorkspaceFolder = { uri: string; name: string };

type FileWithWorkspace = {
  absolutePath: string;
  relativePath: string;
  workspaceFolder: WorkspaceFolder;
};

@Injectable(AIContextProvider, [
  Logger,
  RepositoryDiscoveryService,
  ParsedCliInput,
  FsClient,
  ConfigService,
])
export class CliFileContextProvider extends AbstractAIContextProvider<LocalFileAIContextItem> {
  readonly chatRequiredFeature = DuoFeature.IncludeFileContext;

  #discoveryService: RepositoryDiscoveryService;

  #cliInput: ParsedCliInput;

  #fsClient: FsClient;

  #configService: ConfigService;

  #debouncedSearch: SearchFn;

  constructor(
    logger: Logger,
    discoveryService: RepositoryDiscoveryService,
    cliInput: ParsedCliInput,
    fsClient: FsClient,
    configService: ConfigService,
  ) {
    super('local_file_search', withPrefix(logger, '[CliFileContextProvider]'));
    this.#discoveryService = discoveryService;
    this.#cliInput = cliInput;
    this.#fsClient = fsClient;
    this.#configService = configService;
    this.#debouncedSearch = asyncDebounce(this.#searchFiles.bind(this), 50);
  }

  #getWorkspaceFolders(query: DuoChatAIRequest): WorkspaceFolder[] {
    if (query.workspaceFolders && query.workspaceFolders.length > 0) {
      return query.workspaceFolders;
    }
    return [{ uri: URI.file(this.#cliInput.cwd).toString(), name: basename(this.#cliInput.cwd) }];
  }

  async searchContextItems(query: DuoChatAIRequest): Promise<LocalFileAIContextItem[]> {
    if (query.query.trim() === '') {
      const workspaceFolders = this.#getWorkspaceFolders(query);
      return this.#getModifiedFiles(workspaceFolders);
    }
    return this.#debouncedSearch(query);
  }

  async #getModifiedFiles(workspaceFolders: WorkspaceFolder[]): Promise<LocalFileAIContextItem[]> {
    this.logger.debug('Getting modified files (empty query)');

    const repoToWorkspace =
      await this.#discoveryService.getRepositoriesForWorkspaces(workspaceFolders);
    const allFilesMap = new Map<string, FileWithWorkspace>();

    const filesFromAllRepos = await Promise.all(
      Array.from(repoToWorkspace.entries()).map(async ([repo, folder]) => {
        const folderPath = URI.parse(folder.uri).fsPath;
        const status = await repo.getStatus();
        const repoRelativePath = relative(folderPath, repo.fsPath);

        return status.files.map((file) => {
          const relativePath = repoRelativePath ? join(repoRelativePath, file.path) : file.path;
          const absolutePath = join(repo.fsPath, file.path);
          return { absolutePath, relativePath, workspaceFolder: folder };
        });
      }),
    );

    for (const file of filesFromAllRepos.flat()) {
      allFilesMap.set(file.absolutePath, file);
    }

    const files = Array.from(allFilesMap.values()).slice(0, MAX_RESULTS);

    this.logger.debug(`Found ${files.length} modified files`);

    return Promise.all(files.map((file) => this.#createContextItem(file)));
  }

  async #searchFiles(query: DuoChatAIRequest): Promise<LocalFileAIContextItem[]> {
    const searchQuery = query.query.trim();
    const workspaceFolders = this.#getWorkspaceFolders(query);

    this.logger.debug(`Searching for files matching: "${searchQuery}"`);

    const repoToWorkspace =
      await this.#discoveryService.getRepositoriesForWorkspaces(workspaceFolders);
    const allFilesMap = new Map<string, FileWithWorkspace>();

    const folderResults = await Promise.all(
      Array.from(repoToWorkspace.entries()).map(async ([repo, folder]) => {
        const folderPath = URI.parse(folder.uri).fsPath;
        const files = await repo.getFiles();
        const repoRelativePath = relative(folderPath, repo.fsPath);
        return files.map((filePath) => {
          const relativePath = repoRelativePath ? join(repoRelativePath, filePath) : filePath;
          const absolutePath = join(folderPath, relativePath);
          return { absolutePath, relativePath, workspaceFolder: folder };
        });
      }),
    );

    for (const file of folderResults.flat()) {
      allFilesMap.set(file.absolutePath, file);
    }

    const allFilePaths = Array.from(allFilesMap.keys());
    const filteredPaths = filter(allFilePaths, searchQuery, { maxResults: MAX_RESULTS });

    this.logger.debug(`Found ${filteredPaths.length} files matching query`);

    return Promise.all(
      filteredPaths
        .map((absolutePath) => allFilesMap.get(absolutePath))
        .filter((file): file is FileWithWorkspace => file !== undefined)
        .map((file) => this.#createContextItem(file)),
    );
  }

  async #createContextItem(file: FileWithWorkspace): Promise<LocalFileAIContextItem> {
    const fileUri = URI.file(file.absolutePath);

    const disabledReasons: string[] = [];
    const isBinary = await isBinaryFile(fileUri, this.#fsClient);
    if (isBinary) {
      disabledReasons.push(BINARY_FILE_DISABLED_REASON);
    }

    return {
      id: file.absolutePath,
      category: 'file',
      metadata: {
        title: file.relativePath,
        enabled: disabledReasons.length === 0,
        disabledReasons: disabledReasons.length > 0 ? disabledReasons : undefined,
        icon: 'document',
        secondaryText: this.#formatReference(file.relativePath),
        subType: 'local_file_search',
        subTypeLabel: 'Project file',
        relativePath: file.relativePath,
        workspaceFolder: file.workspaceFolder,
        project: this.#configService.get('projectPath') ?? 'not a GitLab project',
      },
    };
  }

  #formatReference(relativePath: string): string {
    if (/\s/.test(relativePath)) {
      return `@"${relativePath}"`;
    }
    return `@${relativePath}`;
  }

  async retrieveContextItemsWithContent(): Promise<LocalFileAIContextItem[]> {
    const selectedItems = await this.getSelectedContextItems();
    return Promise.all(selectedItems.map((item) => this.getItemWithContent(item)));
  }

  async getItemWithContent(item: LocalFileAIContextItem): Promise<LocalFileAIContextItem> {
    const { readFile } = this.#fsClient.promises;
    const content = (await readFile(item.id)).toString('utf-8');
    return {
      ...item,
      content,
    };
  }
}
