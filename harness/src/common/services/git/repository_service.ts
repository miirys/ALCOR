// Note: we polyfill the "path" import to use `path-browserify` to work in Web IDE.
// See `scripts/esbuild/helpers.ts` `pathImportPlugin` for details.
import { EventEmitter } from 'events';
import type { lstat } from 'node:fs/promises';
import path from 'path';
import _ from 'lodash';
import { Implements, Service, ServiceLifetime } from '@gitlab/needle';
import { Disposable, FileChangeType, WorkspaceFolder } from 'vscode-languageserver-protocol';
import { URI } from 'vscode-uri';
import { minimatch } from 'minimatch';
import PQueue from 'p-queue';
import { LsFetch } from '@gitlab-org/fetch';
import { Logger, withPrefix } from '@gitlab-org/logging';
import {
  FolderUriString,
  GetFileOptions,
  GitSubmodule,
  RepositoryFile,
  RepositoryMap,
  RepositoryService,
  Repository,
  RepoUriString,
  GitLsFiles,
} from '@gitlab-org/repositories';
import {
  fsPathToUri,
  getMatchingWorkspaceFolders,
  parseURIString,
  VirtualFileSystemEvents,
  VirtualFileSystemService,
  WorkspaceFilesUpdate,
  WorkspaceFileUpdate,
} from '@gitlab-org/fs';
import { ConfigService } from '@gitlab-org/config';
import { DocumentService } from '../../document_service';
import { TextDocumentChangeListenerType } from '../../text_document_change_listener_type';
import { DirectoryWalker } from '../fs';
import { FastDirectoryMatcher } from '../fs/dir_matcher';

import { FsClient } from '../fs/fs';
import { Repository as RepositoryImpl } from './repository';
import { COMMON_PATHS_PATTERN } from './glob_settings';

type FileUriString = string;
type FileAndWorkspaceUriCacheKey = `${FileUriString}:${FolderUriString}`;

/**
 * RepositoryService is responsible for managing and detecting repositories in a workspace.
 * This is considered the SSOT (Single Source of Truth) for repository state in a workspace.
 * TODO: Migrate `DuoProjectAccessCache` and `DuoProjectAccessService` to this service.
 *
 * @see `Repository` - Stateful class representing a git repository.
 * @see `GitIgnoreManager` - Manages gitignore files for a repository.
 */
@Service({
  dependencies: [
    Logger,
    VirtualFileSystemService,
    DirectoryWalker,
    FsClient,
    LsFetch,
    ConfigService,
    DocumentService,
    GitLsFiles,
  ],
  lifetime: ServiceLifetime.Singleton,
})
@Implements(RepositoryService)
export class DefaultRepositoryService implements Disposable {
  #virtualFileSystemService: VirtualFileSystemService;

  #directoryWalker: DirectoryWalker;

  #fsClient: FsClient;

  #lsFetch: LsFetch;

  #configService: ConfigService;

  #documentService: DocumentService;

  #gitLsFiles: GitLsFiles;

  #logger: Logger;

  #workspaceSetEmitter = new EventEmitter();

  #fileChangeEmitter = new EventEmitter();

  #fileChangeQueue = new PQueue({ concurrency: 1 });

  #setWorkspaceRepositoriesQueueMap: Map<FolderUriString, PQueue>;

  /**
   * map of workspace folders to a directory matcher
   * The directory matcher is used to match repository URIs against file URIs
   * to determine if the file belongs to a repository.
   */
  #workspaceToRepositories: Map<
    FolderUriString,
    { fastDirectoryMatcher: FastDirectoryMatcher; repositories: RepositoryMap }
  >;

  /**
   * When a fileUri + workspaceUri are used to look up a matching repository, we cache the results.
   * This allows "hot paths" such as code suggestions to quickly look up a previously matched repository.
   */
  #fileAndWorkspaceMatchCache: Map<FileAndWorkspaceUriCacheKey, Repository | undefined> = new Map();

  #activeDocumentUri: URI | undefined;

  #disposables: Disposable[];

  constructor(
    logger: Logger,
    virtualFileSystemService: VirtualFileSystemService,
    directoryWalker: DirectoryWalker,
    fsClient: FsClient,
    lsFetch: LsFetch,
    configService: ConfigService,
    documentService: DocumentService,
    gitLsFiles: GitLsFiles,
  ) {
    this.#virtualFileSystemService = virtualFileSystemService;
    this.#directoryWalker = directoryWalker;
    this.#fsClient = fsClient;
    this.#lsFetch = lsFetch;
    this.#configService = configService;
    this.#documentService = documentService;
    this.#gitLsFiles = gitLsFiles;
    this.#logger = withPrefix(logger, '[RepositoryService]');
    this.#workspaceToRepositories = new Map();
    this.#setWorkspaceRepositoriesQueueMap = new Map();
    this.#disposables = this.#setupEventListeners();
  }

  dispose(): void {
    this.#fileAndWorkspaceMatchCache.clear();
    this.#disposables?.forEach((disposable) => disposable.dispose());
    this.#disposables = [];
  }

  /**
   * Emitted when the workspace repositories are being indexed.
   * This is emitted before the indexing is complete.
   *
   * You can use this as a signal for when indexing for a particular
   * workspace folder has started.
   */
  onWorkspaceRepositoriesStart(listener: (workspaceFolder: WorkspaceFolder) => void): Disposable {
    this.#workspaceSetEmitter.on('workspaceRepositoriesStart', listener);
    return {
      dispose: () =>
        this.#workspaceSetEmitter.removeListener('workspaceRepositoriesStart', listener),
    };
  }

  /**
   * Emitted when the workspace repositories have been set.
   * This is emitted after the indexing is complete.
   *
   * You can use this as a signal for when indexing for a particular
   * workspace folder has completed.
   */
  onWorkspaceRepositoriesFinished(
    listener: (workspaceFolder: WorkspaceFolder) => void,
  ): Disposable {
    this.#workspaceSetEmitter.on('workspaceRepositoriesFinished', listener);
    return {
      dispose: () =>
        this.#workspaceSetEmitter.removeListener('workspaceRepositoriesFinished', listener),
    };
  }

  #triggerWorkspaceRepositoriesStart(workspaceFolder: WorkspaceFolder) {
    this.#workspaceSetEmitter.emit('workspaceRepositoriesStart', workspaceFolder);
  }

  #triggerWorkspaceRepositoriesFinished(workspaceFolder: WorkspaceFolder) {
    this.#workspaceSetEmitter.emit('workspaceRepositoriesFinished', workspaceFolder);
  }

  onFileChange(listener: (fileEvent: WorkspaceFileUpdate) => void): Disposable {
    this.#fileChangeEmitter.on('fileChange', listener);
    return {
      dispose: () => this.#fileChangeEmitter.removeListener('fileChange', listener),
    };
  }

  #triggerFileChange(fileEvent: WorkspaceFileUpdate) {
    this.#fileChangeEmitter.emit('fileChange', fileEvent);
  }

  #setupEventListeners(): Disposable[] {
    return [
      this.#virtualFileSystemService.onFileSystemEvent(async (eventType, data) => {
        switch (eventType) {
          case VirtualFileSystemEvents.WorkspaceFilesEvent:
            await this.#queueSetWorkspaceRepositories(
              data.workspaceFolder,
              data as WorkspaceFilesUpdate,
            );
            break;
          case VirtualFileSystemEvents.WorkspaceFileEvent:
            await this.#fileChangeQueue.add(() =>
              this.#handleWorkspaceFileUpdate(data as WorkspaceFileUpdate),
            );
            break;
          default:
            break;
        }
      }),
      this.#documentService.onDocumentChange(async ({ document }, handlerType) => {
        if (handlerType === TextDocumentChangeListenerType.onDidSetActive) {
          this.#activeDocumentUri = URI.parse(document.uri);
        }
      }),
    ];
  }

  async #queueSetWorkspaceRepositories(
    workspaceFolder: WorkspaceFolder,
    data: WorkspaceFilesUpdate,
  ): Promise<void> {
    const queue =
      this.#setWorkspaceRepositoriesQueueMap.get(workspaceFolder.uri) ||
      new PQueue({ concurrency: 1 });
    await queue.add(() => this.#setWorkspaceRepositories({ workspaceFolder, files: data.files }));
    this.#setWorkspaceRepositoriesQueueMap.set(workspaceFolder.uri, queue);
    return queue.onIdle();
  }

  /**
   * ------------------------------
   * EVENT HANDLERS
   * ------------------------------
   */

  /**
   * Clear existing repositories from workspace and detect new repositories.
   * This can either be triggered by a workspace Files event by the VFS or by a git config file change (.git/config or .gitignore)
   */
  async #setWorkspaceRepositories({
    workspaceFolder,
    files: workspaceFiles,
  }: WorkspaceFilesUpdate) {
    this.#triggerWorkspaceRepositoriesStart(workspaceFolder);
    // pause the file change queue to prevent race conditions, since this method
    // is constructing the new state of the workspace and its repositories
    this.#fileChangeQueue.pause();
    // TODO: send LSP notification to client indicating progress
    // https://gitlab.com/gitlab-org/gitlab/-/issues/489467

    // first clear existing repositories from workspace
    this.#logger.info(`Clearing repositories for workspace ${workspaceFolder.uri}`);
    this.#clearRepositoriesForWorkspace(workspaceFolder.uri);

    const repositories = await this.#detectRepositories(workspaceFiles, workspaceFolder);
    this.#logger.info(
      `Detected ${repositories.length} repositories for workspace ${workspaceFolder.uri}`,
    );

    for (const repository of repositories) {
      this.#addRepositoryToWorkspace(workspaceFolder, repository);
    }
    this.#logger.info(
      `Added ${repositories.length} repositories to workspace ${workspaceFolder.uri}`,
    );

    const repositoryMap = this.getRepositoriesForWorkspaceSync(workspaceFolder.uri);

    await this.#addFilesToRepositories(workspaceFiles, workspaceFolder, repositoryMap);

    // Fallback: ensure repositories have files populated even if initial mapping missed them.
    const repositoryList = Array.from(repositoryMap.values());

    for (const repository of repositoryList) {
      if (repository.getCurrentTreeFiles().length === 0) {
        const repoFiles = workspaceFiles.filter((file) => {
          const belongsToRepo = this.#isPathWithinRepository(file.fsPath, repository.uri.fsPath);
          const isNestedRepoFile = repositoryList.some(
            (otherRepo) =>
              otherRepo !== repository &&
              this.#isPathWithinRepository(file.fsPath, otherRepo.uri.fsPath),
          );

          return belongsToRepo && !isNestedRepoFile;
        });

        repoFiles.forEach((repoFile) => {
          const file = repository.setFile(repoFile);
          this.#setDirectoryForFile(file, repository);
        });
      }
    }

    this.#triggerWorkspaceRepositoriesFinished(workspaceFolder);
    this.#fileChangeQueue.start();
  }

  async #handleWorkspaceFileUpdate({ fileEvent, workspaceFolder }: WorkspaceFileUpdate) {
    try {
      const fileUri = parseURIString(fileEvent.uri);
      if (this.#shouldSkipFile(fileUri)) {
        this.#logger.debug(`Skipping file ${fileUri.toString()}`);
        return;
      }

      // we don't support building repositories from file events
      // this is handled by the workspace files event
      const repository = this.getMatchingRepositorySync(fileUri, workspaceFolder.uri);

      const cacheKey = this.#buildMatchingRepositoryCacheKey(fileUri, workspaceFolder.uri);
      this.#fileAndWorkspaceMatchCache.delete(cacheKey);

      if (!repository) {
        this.#logger.debug(`No matching repository found for file ${fileUri.toString()}`);
        return;
      }

      // if the file is a git config, git worktree pointer, or gitignore file, treat this as a workspace state change
      // this way we re-detect repositories and add/update files in them, as any git change
      // marks the current state as stale
      if (
        RepositoryImpl.isGitConfigFile(fileUri) ||
        RepositoryImpl.isDotGitEntry(fileUri) ||
        RepositoryImpl.isGitIgnoreFile(fileUri)
      ) {
        this.#logger.info(
          `File ${fileUri.toString()} is a git config, git worktree pointer, or gitignore file, updating workspace files`,
        );
        await this.#handleWorkspaceFolderStateChange(workspaceFolder);
        return;
      }

      // if the file change is in a git folder, we need to refresh the tracked files
      if (RepositoryImpl.isInGitFolder(fileUri)) {
        await repository.refreshTrackedFiles({ immediate: true });
      }

      // if change event is the repository root, trigger a workspace state change
      if (this.getRepositoriesForWorkspaceSync(workspaceFolder.uri).has(fileUri.toString())) {
        this.#logger.debug(`user changed repository root ${fileUri.toString()}`);
        await this.#handleWorkspaceFolderStateChange(workspaceFolder);
        return;
      }

      switch (fileEvent.type) {
        case FileChangeType.Created:
          if (await this.#isDirectory(fileUri, fileEvent.type, workspaceFolder)) {
            this.#logger.debug(
              `Directory ${fileUri.toString()} created in workspace ${workspaceFolder.uri}`,
            );
            await this.#handleDirectory(fileUri, workspaceFolder, fileEvent.type);
          } else {
            const file = repository.setFile(fileUri);
            this.#setDirectoryForFile(file, repository);
            this.#logger.debug(
              `File ${fileUri.toString()} added to repository ${repository.uri.toString()}`,
            );
          }
          break;

        case FileChangeType.Changed: {
          const file = repository.setFile(fileUri);
          this.#setDirectoryForFile(file, repository);
          this.#logger.debug(
            `File ${fileUri.toString()} updated in repository ${repository.uri.toString()}`,
          );
          break;
        }
        case FileChangeType.Deleted: {
          if (await this.#isDirectory(fileUri, fileEvent.type, workspaceFolder)) {
            this.#logger.debug(
              `Directory ${fileUri.toString()} deleted in workspace ${workspaceFolder.uri}`,
            );
            await this.#handleDirectory(fileUri, workspaceFolder, fileEvent.type);
          } else {
            repository.removeFile(fileUri);
            this.#logger.debug(
              `File ${fileUri.toString()} removed from repository ${repository.uri.toString()}`,
            );
          }
          break;
        }
        default:
          this.#logger.warn(`Unknown file event ${fileEvent.type} for file ${fileUri.toString()}`);
      }
      this.#triggerFileChange({ fileEvent, workspaceFolder });
    } catch (error) {
      this.#logger.error(`Error handling file update ${fileEvent.uri}`, error);
    }
  }

  async #handleWorkspaceFolderStateChange(workspaceFolder: WorkspaceFolder) {
    const filesForWorkspace = await this.#directoryWalker.findFilesForDirectory({
      directoryUri: parseURIString(workspaceFolder.uri),
    });
    this.#logger.info(
      `Found ${filesForWorkspace.length} files for workspace ${workspaceFolder.uri}`,
    );
    await this.#queueSetWorkspaceRepositories(workspaceFolder, {
      workspaceFolder,
      files: filesForWorkspace,
    });
  }

  /**
   * TODO: make this configurable. https://gitlab.com/gitlab-org/gitlab/-/issues/485509
   * minimatch handles multiple operating system path separators,
   * so we match against the file system path instead of the URI
   */
  #shouldSkipFile(fileUri: URI): boolean {
    return minimatch(fileUri.fsPath, COMMON_PATHS_PATTERN);
  }

  /**
   * We listen for file changes based on the `didChangeWatchedFiles` notification.
   * https://github.com/microsoft/vscode/issues/60813
   * This method is used to determine if a file is a directory because the watcher
   * may emit deletion events for directories, not individual files.
   *
   * eg: it may return `file:///path/to/directory` as a URI
   */
  async #isDirectory(
    fileUri: URI,
    changeType: FileChangeType,
    workspaceFolder: WorkspaceFolder,
  ): Promise<boolean> {
    switch (changeType) {
      case FileChangeType.Deleted: {
        return Boolean(
          this.getMatchingRepositorySync(fileUri, workspaceFolder.uri)?.getDirectory(fileUri, {
            excludeGitFolder: false,
            excludeIgnored: false,
          }),
        );
      }
      case FileChangeType.Created: {
        const lstatFn = this.#fsClient.promises.lstat as typeof lstat;
        const stats = await lstatFn(fileUri.fsPath, { bigint: false });
        return stats.isDirectory();
      }
      default:
        return false;
    }
  }

  async #handleDirectory(uri: URI, workspaceFolder: WorkspaceFolder, changeType: FileChangeType) {
    switch (changeType) {
      case FileChangeType.Deleted:
        await this.#deleteFilesForDirectory(uri, workspaceFolder);
        break;
      case FileChangeType.Created:
        await this.#addFilesForDirectory(uri, workspaceFolder);
        break;
      default:
        break;
    }
  }

  #setDirectoryForFile(file: RepositoryFile, repository: Repository) {
    let currentPath = path.dirname(file.uri.fsPath);
    try {
      // Skip paths until we reach the repository root
      while (
        currentPath.startsWith(repository.uri.fsPath) &&
        currentPath !== repository.uri.fsPath
      ) {
        const dirUri = fsPathToUri(currentPath);
        // Skip if directory already exists
        if (!repository.getDirectory(dirUri, { excludeGitFolder: false, excludeIgnored: false })) {
          repository.setDirectory(dirUri);
        }
        currentPath = path.dirname(currentPath);
      }
    } catch (error) {
      this.#logger.error(
        `[RepositoryService] Error setting directory for file ${currentPath.toString()}`,
        error,
      );
    }
  }

  async #addFilesForDirectory(dirUri: URI, workspaceFolder: WorkspaceFolder) {
    const files = await this.#directoryWalker.findFilesForDirectory({
      directoryUri: dirUri,
    });
    const promises = files.map((file) =>
      this.#handleWorkspaceFileUpdate({
        fileEvent: {
          type: FileChangeType.Created,
          uri: file.toString(),
        },
        workspaceFolder,
      }),
    );
    await Promise.all(promises);
    const repository = this.getMatchingRepositorySync(dirUri, workspaceFolder.uri);
    if (repository) {
      repository.setDirectory(dirUri);
    }
  }

  async #deleteFilesForDirectory(dirUri: URI, workspaceFolder: WorkspaceFolder) {
    const repository = this.getMatchingRepositorySync(dirUri, workspaceFolder.uri);
    if (repository) {
      const deletedFiles = repository.removeFilesUnderDirectory(dirUri);
      const gitRelatedFiles = [];
      for (const file of deletedFiles) {
        if (RepositoryImpl.isGitConfigFile(file.uri) || RepositoryImpl.isGitIgnoreFile(file.uri)) {
          gitRelatedFiles.push(file.uri);
        }
        this.#logger.debug(
          `File ${file.uri.toString()} removed from repository ${repository.uri.toString()}`,
        );
      }
      if (gitRelatedFiles.length) {
        this.#logger.info(
          `Git related files removed from repository ${repository.uri.toString()}, updating workspace files`,
        );
        await this.#handleWorkspaceFolderStateChange(workspaceFolder);
      }
    }
  }

  #getFilesByRepositories(
    files: URI[],
    workspaceFolder: WorkspaceFolder,
    repositoryMap: RepositoryMap,
  ): Map<RepoUriString, Map<string, URI>> {
    const repositories = Array.from(repositoryMap.values());
    const filesByRepositories = new Map<RepoUriString, Map<string, URI>>();

    for (const file of files) {
      const bestPrefixMatch = repositories.reduce<Repository | undefined>((match, repo) => {
        if (this.#isPathWithinRepository(file.fsPath, repo.uri.fsPath)) {
          if (!match || repo.uri.fsPath.length > match.uri.fsPath.length) {
            return repo;
          }
        }
        return match;
      }, undefined);

      const repoUri =
        bestPrefixMatch?.uri || this.#getRepositoryUriForFile(file, workspaceFolder.uri);

      if (repoUri) {
        const repoUriString = repoUri.toString();
        const repoFiles = filesByRepositories.get(repoUriString) ?? new Map();
        repoFiles.set(file.toString(), file);
        filesByRepositories.set(repoUriString, repoFiles);
      }
    }

    if (filesByRepositories.size === 0 && repositoryMap.size === 1) {
      const [onlyRepoUri] = repositoryMap.keys();
      const repoFiles = new Map<string, URI>();
      files.forEach((file) => repoFiles.set(file.toString(), file));
      filesByRepositories.set(onlyRepoUri, repoFiles);
    }

    return filesByRepositories;
  }

  #isPathWithinRepository(filePath: string, repositoryPath: string): boolean {
    const relativePath = path.relative(repositoryPath, filePath);

    if (relativePath === '') {
      return true;
    }

    // path.relative will start with '..' when the target is outside the base path
    return !relativePath.startsWith('..') && !path.isAbsolute(relativePath);
  }

  #buildMatchingRepositoryCacheKey(
    fileUri: URI,
    workspaceFolderUri: FolderUriString,
  ): FileAndWorkspaceUriCacheKey {
    return `${fileUri.toString()}:${workspaceFolderUri}`;
  }

  /**
   * ------------------------------
   * CLIENT FACING METHODS
   * ------------------------------
   */
  async getMatchingRepository(
    fileUri: URI,
    workspaceFolderUri: FolderUriString,
  ): Promise<Repository | undefined> {
    // Alternative implementations of the RepositoryService won't be cashing this logic and will have to be async
    return this.getMatchingRepositorySync(fileUri, workspaceFolderUri);
  }

  getMatchingRepositorySync(
    fileUri: URI,
    workspaceFolderUri: FolderUriString,
  ): Repository | undefined {
    const cacheKey = this.#buildMatchingRepositoryCacheKey(fileUri, workspaceFolderUri);
    if (this.#fileAndWorkspaceMatchCache.has(cacheKey)) {
      return this.#fileAndWorkspaceMatchCache.get(cacheKey);
    }

    const repositoryUri = this.#getRepositoryUriForFile(fileUri, workspaceFolderUri);
    if (!repositoryUri) {
      this.#fileAndWorkspaceMatchCache.set(cacheKey, undefined);
      return undefined;
    }
    const repository = this.getRepositoriesForWorkspaceSync(workspaceFolderUri).get(
      repositoryUri.toString(),
    );

    this.#fileAndWorkspaceMatchCache.set(cacheKey, repository);
    return repository;
  }

  getRepositoryFileForUri(
    fileUri: URI,
    repositoryUri: URI,
    workspaceFolder: WorkspaceFolder,
  ): RepositoryFile | null {
    const repository = this.getRepositoryForWorkspace(workspaceFolder.uri, repositoryUri);
    return repository?.getFile(fileUri) ?? null;
  }

  getCurrentFilesForRepository(
    repositoryUri: URI,
    workspaceFolderUri: FolderUriString,
    options: GetFileOptions = {},
  ): RepositoryFile[] {
    const repository = this.getRepositoryForWorkspace(workspaceFolderUri, repositoryUri);
    if (!repository) {
      return [];
    }
    return repository.getCurrentTreeFiles(options);
  }

  getCurrentFilesForWorkspace(
    workspaceFolderUri: FolderUriString,
    options: GetFileOptions = {},
  ): RepositoryFile[] {
    const repositories = this.getRepositoriesForWorkspaceSync(workspaceFolderUri);
    const allFiles: RepositoryFile[] = [];
    repositories.forEach((repository) => {
      repository.getCurrentTreeFiles(options).forEach((file) => {
        allFiles.push(file);
      });
    });
    return allFiles;
  }

  async getRepositoriesForWorkspace(workspaceFolderUri: FolderUriString): Promise<Repository[]> {
    // Alternative implementations of the RepositoryService won't be cashing this logic and will have to be async
    const repositories = Array.from(
      this.getRepositoriesForWorkspaceSync(workspaceFolderUri).values(),
    );
    return _.sortBy(repositories, (r) => r.uri.toString());
  }

  getRepositoriesForWorkspaceSync(workspaceFolderUri: FolderUriString): RepositoryMap {
    return this.#workspaceToRepositories.get(workspaceFolderUri)?.repositories || new Map();
  }

  getRepositoryForWorkspace(
    workspaceFolderUri: FolderUriString,
    repositoryUri: URI,
  ): Repository | undefined {
    return this.getRepositoriesForWorkspaceSync(workspaceFolderUri).get(repositoryUri.toString());
  }

  getRepositoryForActiveDocument(): Repository | undefined {
    const workspaceFolders = this.#configService.get('workspaceFolders');

    if (!this.#activeDocumentUri || !workspaceFolders?.length) {
      this.#logger.debug(
        `No active document or workspace folders, skipping find repository for active document.`,
      );
      return undefined;
    }

    const matchingWorkspaceFolders = getMatchingWorkspaceFolders(
      this.#activeDocumentUri.toString(),
      workspaceFolders,
    ).sort((a, b) => {
      // Sort by path length descending - longer paths (deeper nesting, more specific repo path) come first
      return b.uri.toString().length - a.uri.toString().length;
    });

    this.#logger.debug(
      `Found ${matchingWorkspaceFolders.length} matching workspace folders for active document ${this.#activeDocumentUri.toString()}`,
    );
    for (const workspaceFolder of matchingWorkspaceFolders) {
      const repository = this.getMatchingRepositorySync(
        this.#activeDocumentUri,
        workspaceFolder.uri,
      );
      if (repository) return repository;
    }

    this.#logger.debug(
      `No matching repository found for active document ${this.#activeDocumentUri.toString()} in workspace folders ${JSON.stringify(workspaceFolders)}`,
    );
    return undefined;
  }

  /**
   * ------------------------------
   * STATE MANAGEMENT
   * ------------------------------
   */
  #addRepositoryToWorkspace(workspaceFolder: WorkspaceFolder, repository: Repository) {
    const { fastDirectoryMatcher, repositories } = this.#workspaceToRepositories.get(
      workspaceFolder.uri,
    ) || {
      fastDirectoryMatcher: new FastDirectoryMatcher(),
      repositories: new Map(),
    };
    this.#logger.info(`Adding repository ${repository.uri} to workspace ${workspaceFolder.uri}`);
    fastDirectoryMatcher.addDirectoryToMatch(repository.uri);
    repositories.set(repository.uri.toString(), repository);
    this.#workspaceToRepositories.set(workspaceFolder.uri, {
      fastDirectoryMatcher,
      repositories,
    });
  }

  async #addFilesToRepositories(
    files: URI[],
    workspaceFolder: WorkspaceFolder,
    repositoryMap: RepositoryMap,
  ) {
    const filesByRepositories = this.#getFilesByRepositories(files, workspaceFolder, repositoryMap);

    if (filesByRepositories.size === 0) {
      repositoryMap.forEach((repository) => {
        const repoFiles = new Map<string, URI>();
        const otherRepositories = Array.from(repositoryMap.values()).filter(
          (repo) => repo !== repository,
        );

        files
          .filter((file) => {
            const belongsToRepo = this.#isPathWithinRepository(file.fsPath, repository.uri.fsPath);
            const isNestedRepoFile = otherRepositories.some((repo) =>
              this.#isPathWithinRepository(file.fsPath, repo.uri.fsPath),
            );
            return belongsToRepo && !isNestedRepoFile;
          })
          .forEach((file) => repoFiles.set(file.toString(), file));

        filesByRepositories.set(repository.uri.toString(), repoFiles);
      });
    }

    const setupAndAddFiles = async ([repositoryUri, repoFiles]: [
      RepoUriString,
      Map<string, URI>,
    ]) => {
      const repository = repositoryMap.get(repositoryUri);
      if (!repository) return 0;
      const repoFileArray = Array.from(repoFiles.values());
      const fileCount = repoFileArray.length;

      const gitFiles = await repository.setupGitForRepository(repoFileArray);
      if (gitFiles instanceof Error) {
        this.#logger.warn(
          `Error setting up git for repository ${repository.uri.toString()}: ${gitFiles.message}`,
          gitFiles,
        );
      } else {
        this.#logger.debug(
          `Added ${gitFiles.ignoreFiles.size} gitignores to repository ${repository.uri}`,
        );
        this.#logger.debug(
          `Added ${gitFiles.trackedFiles.size} tracked files to repository ${repository.uri}`,
        );
        if (gitFiles.excludeFile) {
          this.#logger.debug(
            `Added ${gitFiles.excludeFile.toString()} to repository ${repository.uri}`,
          );
        }

        if (gitFiles.trackedFiles.size === 0) {
          await repository.refreshTrackedFiles({ immediate: true });
        }
      }

      repoFileArray.forEach((repoFile) => {
        const file = repository.setFile(repoFile);
        this.#setDirectoryForFile(file, repository);
      });

      if (!(gitFiles instanceof Error)) {
        this.#logger.debug(`Added ${fileCount} files to repository ${repository.uri}`);
      }

      return fileCount;
    };

    const results = await Promise.all(Array.from(filesByRepositories).map(setupAndAddFiles));
    const totalFiles = results.reduce((sum, count) => sum + count, 0);

    this.#logger.debug(`Total files added: ${totalFiles}`);
  }

  #getRepositoryUriForFile(fileUri: URI, workspaceFolderUri: FolderUriString): URI | undefined {
    const directoryMatcher = this.#getDirectoryMatcherForWorkspace(workspaceFolderUri);
    const repositoryUris = directoryMatcher.findMatchingDirectories(fileUri);

    if (repositoryUris?.length) {
      // the directory matcher returns the directories in order from shallow to deep
      // so we always return the deepest repository uri
      return repositoryUris.at(-1);
    }

    // Fallback: if the directory matcher has no entries yet (e.g. during initial detection),
    // fall back to prefix matching against known repositories in the workspace.
    const repositoryMap = this.getRepositoriesForWorkspaceSync(workspaceFolderUri);
    let bestMatch: Repository | undefined;

    repositoryMap.forEach((repo) => {
      const repoPath = repo.uri.fsPath;
      if (this.#isPathWithinRepository(fileUri.fsPath, repoPath)) {
        if (!bestMatch || repoPath.length > bestMatch.uri.fsPath.length) {
          bestMatch = repo;
        }
      }
    });

    if (!bestMatch) {
      this.#logger.warn(`No matching repository found for file ${fileUri.toString()}`);
      return undefined;
    }

    return bestMatch.uri;
  }

  #getDirectoryMatcherForWorkspace(workspaceFolderUri: FolderUriString): FastDirectoryMatcher {
    return (
      this.#workspaceToRepositories.get(workspaceFolderUri)?.fastDirectoryMatcher ||
      new FastDirectoryMatcher()
    );
  }

  #clearRepositoriesForWorkspace(workspaceFolderUri: FolderUriString): void {
    this.#logger.debug(`Emptying repositories for workspace ${workspaceFolderUri}`);
    const directoryMatcher = this.#getDirectoryMatcherForWorkspace(workspaceFolderUri);
    directoryMatcher.dispose();

    Array.from(this.#fileAndWorkspaceMatchCache.keys())
      .filter((key) => key.endsWith(`:${workspaceFolderUri}`))
      .forEach((key) => this.#fileAndWorkspaceMatchCache.delete(key));

    this.#workspaceToRepositories.delete(workspaceFolderUri);
    const repositoryMap = this.getRepositoriesForWorkspaceSync(workspaceFolderUri);
    repositoryMap.forEach((repo) => {
      repo.dispose();
      this.#logger.debug(`Repository ${repo.uri} has been disposed`);
    });
    repositoryMap.clear();
    this.#workspaceToRepositories.delete(workspaceFolderUri);
    this.#logger.debug(`Repositories for workspace ${workspaceFolderUri} have been emptied`);
  }

  /**
   *------------------------------
   * GIT RELATED OPERATIONS
   * ------------------------------
   */

  /**
   * Detects repositories in the workspace by finding .git/config files.
   * For each .git/config file, it creates a repository object.
   * It also reads the gitignore files and adds them to the repository's ignore manager.
   */
  async #detectRepositories(files: URI[], workspaceFolder: WorkspaceFolder): Promise<Repository[]> {
    const gitConfigFiles = files.filter((file) => RepositoryImpl.isGitConfigFile(file));
    const dotGitEntries = files.filter((file) => RepositoryImpl.isDotGitEntry(file));

    const repositories = new Map<
      RepoUriString,
      { repoUri: URI; configFileUri: URI; gitDirUri: URI }
    >();

    for (const configFile of gitConfigFiles) {
      const repoUri = RepositoryImpl.getRepoRootFromGitConfig(configFile);
      const gitDirUri = RepositoryImpl.getGitDirFromGitConfig(configFile);
      repositories.set(repoUri.toString(), { repoUri, configFileUri: configFile, gitDirUri });
    }

    const resolvedDotGitEntries = await Promise.all(
      dotGitEntries.map((dotGitFile) => this.#resolveRepositoryFromDotGit(dotGitFile)),
    );

    for (const resolved of resolvedDotGitEntries) {
      if (resolved) {
        repositories.set(resolved.repoUri.toString(), resolved);
      }
    }

    return Array.from(repositories.values()).map(({ repoUri, configFileUri, gitDirUri }) => {
      this.#logger.info(`Detected repository at ${repoUri.toString()}`);
      return new RepositoryImpl({
        uri: repoUri,
        configFileUri,
        gitDirUri,
        workspaceFolder,
        fsClient: this.#fsClient,
        lsFetch: this.#lsFetch,
        gitLsFiles: this.#gitLsFiles,
      });
    });
  }

  async #resolveRepositoryFromDotGit(
    dotGitUri: URI,
  ): Promise<{ repoUri: URI; gitDirUri: URI; configFileUri: URI } | undefined> {
    try {
      const lstatFn = this.#fsClient.promises.lstat as typeof lstat;
      const stats = await lstatFn(dotGitUri.fsPath, { bigint: false });
      if (stats.isDirectory()) {
        return undefined;
      }

      const raw = await this.#fsClient.promises.readFile(dotGitUri.fsPath, 'utf-8');
      const match = raw.match(/gitdir:\s*(.+)/i);
      const gitDirPath = match?.[1]?.trim();
      if (!gitDirPath) {
        this.#logger.debug(`Unable to resolve gitdir from ${dotGitUri.toString()}`);
        return undefined;
      }

      let resolvedGitDir = gitDirPath;
      if (!path.isAbsolute(gitDirPath)) {
        resolvedGitDir = path.resolve(path.dirname(dotGitUri.fsPath), gitDirPath);
      }

      let configPath = path.join(resolvedGitDir, 'config');
      let configExists = await this.#fileExists(configPath);

      if (!configExists) {
        const commonDirPath = path.join(resolvedGitDir, 'commondir');
        const commonDirExists = await this.#fileExists(commonDirPath);
        if (!commonDirExists) {
          this.#logger.debug(
            `Resolved gitdir for ${dotGitUri.toString()}, but config and commondir were missing`,
          );
          return undefined;
        }

        const commonDirRaw = await this.#fsClient.promises.readFile(commonDirPath, 'utf-8');
        const commonDirSegment = commonDirRaw.trim();
        if (!commonDirSegment) {
          this.#logger.debug(
            `Resolved gitdir for ${dotGitUri.toString()}, but commondir was empty`,
          );
          return undefined;
        }

        const resolvedCommonDir = path.isAbsolute(commonDirSegment)
          ? commonDirSegment
          : path.resolve(resolvedGitDir, commonDirSegment);
        configPath = path.join(resolvedCommonDir, 'config');
        configExists = await this.#fileExists(configPath);
        if (!configExists) {
          this.#logger.debug(
            `Resolved gitdir for ${dotGitUri.toString()}, but config was missing in commondir`,
          );
          return undefined;
        }
      }

      return {
        repoUri: fsPathToUri(path.dirname(dotGitUri.fsPath)),
        gitDirUri: fsPathToUri(resolvedGitDir),
        configFileUri: fsPathToUri(configPath),
      };
    } catch (error) {
      this.#logger.debug(`Failed to resolve repository from ${dotGitUri.toString()}`, error);
      return undefined;
    }
  }

  async #fileExists(filePath: string): Promise<boolean> {
    const { access } = this.#fsClient.promises as {
      access?: typeof import('fs/promises').access;
    };
    if (!access) {
      return false;
    }

    try {
      await access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get all submodules for a repository
   * @param repositoryUri URI of the repository
   * @param workspaceFolderUri The workspace folder URI containing the repository
   * @returns Promise resolving to an array of `GitSubmodule` objects, or undefined if repository not found
   */
  async getSubmodulesForRepository(
    repositoryUri: URI,
    workspaceFolderUri: FolderUriString,
  ): Promise<GitSubmodule[] | undefined> {
    const repository = this.getRepositoryForWorkspace(workspaceFolderUri, repositoryUri);

    if (!repository) {
      return undefined;
    }

    return repository.getSubmodules();
  }
}
