// Note: we polyfill the "path" import to use `path-browserify` to work in Web IDE.
// See `scripts/esbuild/helpers.ts` `pathImportPlugin` for details.
import path from 'path';
import { WorkspaceFolder } from 'vscode-languageserver-protocol';
import { URI, Utils } from 'vscode-uri';
import * as git from 'isomorphic-git';
import debounce from 'lodash/debounce';
import { DebouncedFunc } from 'lodash';
import { minimatch } from 'minimatch';
import { LsFetch } from '@gitlab-org/fetch';
import {
  GitSubmodule,
  GetFileOptions,
  GitFiles,
  RepositoryDirectory,
  RepositoryFile,
  Repository as RepositoryInterface,
  RepositoryUri,
  GitRemote,
  GitLsFiles,
} from '@gitlab-org/repositories';
import { fsPathToUri, parseURIString } from '@gitlab-org/fs';
import { log } from '../../log';
import { FsClient } from '../fs/fs';
import { GitIgnoreManager } from './git_ignore_manager';
import { getRemoteRepositoryInfo } from './git_remote_repository_info';
import { isGitModulesFile, parseGitModulesContent } from './submodule_parser';

/**
 * Repository represents a git repository.
 * It is responsible for managing the files in the repository
 * and the `GitIgnoreManager` to manage the gitignore files.
 *
 * It's also used for common git parsing operations, eg
 * `Repository.isGitIgnoreFile`, `Repository.isGitConfigFile`, etc.
 *
 * This class is stateful.
 *
 * This is an internal class of the `RepositoryService`.
 * @see `RepositoryService`
 * @see `GitIgnoreManager`
 */
export class Repository implements RepositoryInterface {
  readonly workspaceFolder: WorkspaceFolder;

  /**
   * The URI of the repository root directory.
   * Ex: file:///gitlab/work/git/my-repo
   */
  readonly uri: URI;

  /**
   * The URI of the repository git config file.
   * Ex: file:///gitlab/work/git/my-repo/.git/config
   */
  readonly configFileUri: URI;

  /**
   * The URI of the git metadata directory for this repository. For worktrees
   * this points at the referenced gitdir (e.g. /repo/.git/worktrees/<name>).
   */
  readonly gitDirUri: URI;

  #files: Map<string, RepositoryFile>;

  #directories: Map<string, RepositoryDirectory>;

  #ignoreManager?: GitIgnoreManager;

  #fsClient: FsClient;

  #lsFetch: LsFetch;

  #gitLsFiles: GitLsFiles;

  #gitFiles: GitFiles;

  #refreshTrackedFilesDebounced: DebouncedFunc<() => Promise<void>>;

  constructor({
    configFileUri,
    workspaceFolder,
    uri,
    fsClient,
    lsFetch,
    gitLsFiles,
    gitDirUri,
  }: {
    workspaceFolder: WorkspaceFolder;
    uri: RepositoryUri;
    configFileUri: URI;
    gitDirUri?: URI;
    fsClient: FsClient;
    lsFetch: LsFetch;
    gitLsFiles: GitLsFiles;
  }) {
    this.workspaceFolder = workspaceFolder;
    this.uri = uri;
    this.configFileUri = configFileUri;
    this.gitDirUri = gitDirUri ?? Repository.getDefaultGitDirUri(uri);
    this.#files = new Map();
    this.#directories = new Map();
    this.#gitFiles = {
      ignoreFiles: new Map(),
      excludeFile: undefined,
      trackedFiles: new Set(),
    };
    this.#fsClient = fsClient;
    this.#lsFetch = lsFetch;
    this.#gitLsFiles = gitLsFiles;
    this.#refreshTrackedFilesDebounced = debounce(this.#refreshTrackedFilesImpl, 300);
  }

  /**
   * Check if the file is ignored by git.
   * This will match the file against gitignore patterns in the directory structure
   * and all its parent directories.
   *
   * This also checks the .gitignore/exclude file in the root of the git repository.
   *
   * If the file is tracked by git, it is not ignored.
   */
  isFileIgnored(fileUri: URI): boolean {
    if (this.#gitFiles.trackedFiles.has(fileUri.toString())) {
      return false;
    }
    return this.#ignoreManager?.isIgnored(fileUri) ?? false;
  }

  /**
   * Check if the directory is ignored by git.
   * This will match the directory against gitignore patterns in the directory structure
   * and all its parent directories.
   */
  isDirectoryIgnored(directoryUri: URI): boolean {
    // FIXME: Repository Directory should handle gitkeep
    // https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/-/issues/522
    return (
      this.#ignoreManager?.isIgnored(fsPathToUri(path.join(directoryUri.fsPath, '**'))) ?? false
    );
  }

  static dirUri(fileUri: URI): URI {
    return fsPathToUri(path.dirname(fileUri.fsPath));
  }

  /**
   * Set the file for a file URI.
   * Returns the `RepositoryFile` object.
   */
  setFile(fileUri: URI): RepositoryFile {
    const isIgnored = this.isFileIgnored(fileUri);
    const repositoryFile = {
      uri: fileUri,
      isIgnored,
      repositoryUri: this.uri,
      workspaceFolder: this.workspaceFolder,
      dirUri: () => Repository.dirUri(fileUri),
    } satisfies RepositoryFile;
    this.#files.set(fileUri.toString(), repositoryFile);
    return repositoryFile;
  }

  /**
   * Set the directory for a file.
   * This will update the directory map for the file.
   *
   * Be sure to call this for each directory the file is in.
   *
   * Returns the `RepositoryDirectory` object.
   */
  setDirectory(directoryUri: URI): RepositoryDirectory {
    const isIgnored = this.isDirectoryIgnored(directoryUri);
    const repositoryDirectory = {
      uri: directoryUri,
      repositoryUri: this.uri,
      isIgnored,
      workspaceFolder: this.workspaceFolder,
    } satisfies RepositoryDirectory;
    this.#directories.set(directoryUri.toString(), repositoryDirectory);
    return repositoryDirectory;
  }

  getFile(fileUri: URI, options: GetFileOptions = {}): RepositoryFile | undefined {
    const file = this.#files.get(fileUri.toString());
    if (file && this.#filter(file, options)) {
      return file;
    }
    return undefined;
  }

  getFiles(options: GetFileOptions = {}): RepositoryFile[] {
    return Array.from(this.#files.values()).filter((file) => this.#filter(file, options));
  }

  getDirectory(directoryUri: URI, options: GetFileOptions = {}): RepositoryDirectory | undefined {
    const directory = this.#directories.get(directoryUri.toString());
    if (directory && this.#filter(directory, options)) {
      return directory;
    }
    return undefined;
  }

  removeFile(fileUri: URI): void {
    this.#files.delete(fileUri.toString());
  }

  /**
   * Removes all files under the specified directory URI from the repository's files map.
   */
  removeFilesUnderDirectory(directoryUri: URI): RepositoryFile[] {
    const directoryPath = directoryUri.toString();

    const urisToDelete = [];

    for (const repositoryFile of this.#files.keys()) {
      if (repositoryFile.startsWith(directoryPath)) {
        urisToDelete.push(this.#files.get(repositoryFile));
      }
    }

    // remove all files under the directory
    for (const file of urisToDelete) {
      if (file) {
        this.#files.delete(file.uri.toString());
      }
    }

    // remove all directories under the directory
    for (const directory of this.#directories.keys()) {
      if (directory.startsWith(directoryPath)) {
        this.#directories.delete(directory);
      }
    }
    return urisToDelete.filter((file) => file !== undefined);
  }

  getCurrentTreeFiles(options: GetFileOptions = {}): RepositoryFile[] {
    return Array.from(this.#files.values()).filter((file) => this.#filter(file, options));
  }

  getCurrentTreeFile(fileUri: URI): RepositoryFile | undefined {
    return this.#files.get(fileUri.toString());
  }

  getCurrentTrackedFiles(): string[] {
    return Array.from(this.#gitFiles.trackedFiles);
  }

  #filter(data: RepositoryFile | RepositoryDirectory, options: GetFileOptions): boolean {
    if (options.excludeGitFolder && Repository.isInGitFolder(data.uri)) {
      return false;
    }
    if (this.#gitFiles.trackedFiles.has(data.uri.toString())) {
      if (options.glob) {
        return minimatch(data.uri.toString(), options.glob, { matchBase: true });
      }
      return true;
    }
    if (options.excludeIgnored && data.isIgnored) {
      return false;
    }
    if (options.glob) {
      return minimatch(data.uri.toString(), options.glob, { matchBase: true });
    }
    return true;
  }

  /**
   * Setup the git repository by creating a new `GitIgnoreManager` and adding the gitignore files.
   *
   * This will also update the tracked files in the repository.
   */
  async setupGitForRepository(files: URI[]): Promise<GitFiles | Error> {
    try {
      const gitFiles = await this.#getGitFiles(files);
      const ignoreManager = new GitIgnoreManager(this.uri);
      for (const [ignoreFile, ignoreFileContent] of gitFiles.ignoreFiles.entries()) {
        ignoreManager.addGitignore(ignoreFile, ignoreFileContent);
      }
      if (gitFiles.excludeFile) {
        const { readFile } = this.#fsClient.promises;
        const excludeContent = (await readFile(gitFiles.excludeFile.fsPath)).toString('utf-8');

        ignoreManager.addExcludeFile(excludeContent);
      }
      this.#ignoreManager = ignoreManager;
      this.#gitFiles = gitFiles;
      return gitFiles;
    } catch (error) {
      return error as Error;
    }
  }

  async #getGitFiles(files: URI[]): Promise<GitFiles> {
    const ignoreFiles: URI[] = [];
    let excludeFile: URI | undefined;
    for (const file of files) {
      if (Repository.isGitIgnoreFile(file)) {
        ignoreFiles.push(file);
      } else if (Repository.isGitExcludeFile(file)) {
        excludeFile = file;
      }
    }
    if (!excludeFile) {
      excludeFile = await this.#resolveExcludeFileFromGitDir();
    }
    const { readFile } = this.#fsClient.promises;
    const [ignoreContents, trackedFiles] = await Promise.all([
      Promise.all(ignoreFiles.map((fileUri) => readFile(fileUri.fsPath))),
      this.#getTrackedFiles(),
    ]);
    const ignoreFilesMap = new Map(
      ignoreFiles.map((file, index) => [file, ignoreContents[index].toString('utf-8')]),
    );

    return {
      ignoreFiles: ignoreFilesMap,
      excludeFile,
      trackedFiles: new Set(trackedFiles),
    };
  }

  async #getTrackedFiles(): Promise<string[]> {
    const remotes = await this.#listRemotes();
    const repositoryUrl = remotes.length > 0 ? remotes[0].url : this.uri.toString();

    return this.#tryGitLsFiles(repositoryUrl);
  }

  async #tryGitLsFiles(repositoryUrl: string): Promise<string[]> {
    try {
      const trackedFiles = await this.#gitLsFiles.execute(
        this.uri.fsPath,
        repositoryUrl,
        '', // Empty password for local operations
        this.gitDirUri.fsPath,
      );

      return trackedFiles?.map((file) => Utils.resolvePath(this.uri, file).toString()) || [];
    } catch (err) {
      log.error(
        `[Repository] An error occurred while using system git ls-files in "${this.uri}". This repository will not function correctly in the language server.`,
        err,
      );
      return [];
    }
  }

  #updateTrackedFiles(trackedFiles: string[]): void {
    this.#gitFiles.trackedFiles.clear();
    for (const file of trackedFiles) {
      this.#gitFiles.trackedFiles.add(file);
    }
  }

  async #refreshTrackedFilesImpl() {
    const trackedFiles = await this.#getTrackedFiles();
    this.#updateTrackedFiles(trackedFiles);
  }

  /**
   * Refresh the tracked files in the repository.
   * This is debounced to prevent excessive calls to the git command.
   */
  refreshTrackedFiles(options?: { immediate?: boolean }) {
    if (options?.immediate) {
      return this.#refreshTrackedFilesImpl();
    }

    return this.#refreshTrackedFilesDebounced();
  }

  async getCurrentBranch(): Promise<string> {
    const branch = await git.currentBranch({
      fs: this.#fsClient,
      dir: this.uri.fsPath,
      gitdir: this.gitDirUri.fsPath,
      fullname: false,
    });
    return branch ?? this.getMainBranch();
  }

  async getTrackingBranchName(): Promise<string | undefined> {
    const currentBranch = await git.currentBranch({
      fs: this.#fsClient,
      dir: this.uri.fsPath,
      gitdir: this.gitDirUri.fsPath,
      fullname: false,
    });
    if (!currentBranch) return undefined;

    try {
      const trackingRef = await git.getConfig({
        fs: this.#fsClient,
        dir: this.uri.fsPath,
        gitdir: this.gitDirUri.fsPath,
        path: `branch.${currentBranch}.merge`,
      });

      return trackingRef ? trackingRef.replace('refs/heads/', '') : currentBranch;
    } catch {
      // Return original branch if no tracking branch is configured
      return currentBranch;
    }
  }

  async getHeadRef(): Promise<string> {
    return git.resolveRef({
      fs: this.#fsClient,
      dir: this.uri.fsPath,
      gitdir: this.gitDirUri.fsPath,
      ref: 'HEAD',
    });
  }

  async listBranches(): Promise<string[]> {
    const branches = await git.listBranches({
      fs: this.#fsClient,
      dir: this.uri.fsPath,
      gitdir: this.gitDirUri.fsPath,
    });
    return branches;
  }

  async #listRemotes(): Promise<GitRemote[]> {
    try {
      const remotes = await git.listRemotes({
        fs: this.#fsClient,
        dir: this.uri.fsPath,
        gitdir: this.gitDirUri.fsPath,
      });

      return remotes;
    } catch (error) {
      log.error(
        `[Repository] An error occurred while trying to list remotes for repository "${this.uri.fsPath}"`,
        error,
      );
    }

    return [];
  }

  async getMainBranch(): Promise<string> {
    try {
      const remotes = await this.#listRemotes();
      // Multiple remotes can be configured. Look first for `origin`, otherwise pick the first remote
      const origin = remotes.find((r) => r.remote === 'origin') || remotes.at(0);
      if (origin) {
        const originName = origin.remote;
        log.debug(
          `[Repository] Detected remote "${originName}", for repository "${this.uri.fsPath}"`,
        );

        const mainBranchFromRef = await this.#getMainBranchFromRef(originName);
        if (mainBranchFromRef) {
          log.debug(
            `[Repository] Got repository main branch name "${mainBranchFromRef}" from local ref, for repository "${this.uri.fsPath}"`,
          );
          return mainBranchFromRef;
        }

        const mainBranchFromRemote = await this.#getMainBranchFromRemoteRepoInfo(origin.url);
        if (mainBranchFromRemote) {
          log.debug(
            `[Repository] Got repository main branch name "${mainBranchFromRemote}" from remote, for repository "${this.uri.fsPath}"`,
          );
          return mainBranchFromRemote;
        }
      }

      const mainBranchFromBranchesList = await this.#tryGetMainBranchFromLocalBranches();
      if (mainBranchFromBranchesList) {
        log.debug(
          `[Repository] Got repository main branch name "${mainBranchFromBranchesList}" from current local branches in repository "${this.uri.fsPath}"`,
        );
        return mainBranchFromBranchesList;
      }
    } catch (error) {
      log.error(
        `[Repository] An error occurred while trying to determine the main branch name for repository "${this.uri.fsPath}"`,
        error,
      );
    }

    log.error(
      `[Repository] Could not detect main branch for repository "${this.uri.fsPath}". Defaulting to "main", but this may be incorrect`,
    );
    return 'main';
  }

  async #getMainBranchFromRef(origin: string): Promise<string | undefined> {
    try {
      const remoteHeadRef = await this.#fsClient.promises.readFile(
        path.join(this.gitDirUri.fsPath, 'refs', 'remotes', origin, 'HEAD'),
      );
      return remoteHeadRef.toString().trim().replace(`ref: refs/remotes/${origin}/`, '');
    } catch {
      log.debug(
        `[Repository] Could not find repository main branch name from "refs/remotes/${origin}/HEAD", for repository "${this.uri.fsPath}"`,
      );
    }
    return undefined;
  }

  async #getMainBranchFromRemoteRepoInfo(remoteUrl: string): Promise<string | undefined> {
    try {
      const repositoryInfo = await getRemoteRepositoryInfo(this.#lsFetch, remoteUrl);
      return repositoryInfo.HEAD?.replace('refs/head/', '');
    } catch (err) {
      // Not considered error-level since we only currently support public unauthenticated repos,
      // so we expect this to throw in general use for some customers
      log.debug(
        `[Repository] Could not get remote repository info for repository "${this.uri.fsPath}"`,
        err,
      );
    }
    return undefined;
  }

  async #tryGetMainBranchFromLocalBranches(): Promise<string | undefined> {
    const branches = await git.listBranches({
      fs: this.#fsClient,
      dir: this.uri.fsPath,
      gitdir: this.gitDirUri.fsPath,
    });

    const mainBranchNames = ['main', 'master', 'trunk', 'development'];
    for (const name of mainBranchNames) {
      if (branches.includes(name)) {
        return name;
      }
    }
    return undefined;
  }

  dispose(): void {
    this.#ignoreManager?.dispose();
    this.#files.clear();
  }

  static getRepoRootFromGitConfig(gitConfigUri: URI): URI {
    return Utils.resolvePath(gitConfigUri, '..', '..');
  }

  static getGitDirFromGitConfig(gitConfigUri: URI): URI {
    return Utils.resolvePath(gitConfigUri, '..');
  }

  static getRepoGitConfigFile(repoUri: URI): URI {
    return Utils.resolvePath(repoUri, '.git', 'config');
  }

  static getGitConfigFiles(files: URI[]): URI[] {
    return files.filter((file) => Repository.isGitConfigFile(file));
  }

  static isGitIgnoreFile(file: URI): boolean {
    return file.toString().endsWith('.gitignore');
  }

  static isGitConfigFile(file: URI): boolean {
    const { fsPath } = file;
    return fsPath.endsWith('/.git/config') || fsPath.endsWith('\\.git\\config');
  }

  static isInGitFolder(fileUri: URI): boolean {
    const { fsPath } = fileUri;
    return fsPath.includes('/.git/') || fsPath.includes('\\.git\\');
  }

  static isGitExcludeFile(file: URI): boolean {
    const { fsPath } = file;
    return fsPath.endsWith('/.git/info/exclude') || fsPath.endsWith('\\.git\\info\\exclude');
  }

  static isDotGitEntry(file: URI): boolean {
    const { fsPath } = file;
    return fsPath.endsWith('/.git') || fsPath.endsWith('\\.git');
  }

  /**
   * Gets the URI for the .gitmodules file in this repository
   * @returns URI to the .gitmodules file, or undefined if it doesn't exist
   */
  getGitSubModulesFileUri(): URI | undefined {
    const modulesPath = path.join(this.uri.fsPath, '.gitmodules');
    const moduleUri = fsPathToUri(modulesPath);

    return moduleUri;
  }

  /**
   * Gets the list of submodules for this repository
   * @returns Promise resolving to an array of GitSubmodule objects
   */
  async getSubmodules(): Promise<GitSubmodule[]> {
    const gitmodulesFileUri = this.getGitSubModulesFileUri();
    if (!gitmodulesFileUri) {
      return [];
    }

    try {
      const fileContent = await this.#fsClient.promises.readFile(gitmodulesFileUri.fsPath, 'utf-8');
      const submodules = parseGitModulesContent({
        content: fileContent,
        repositoryUri: this.uri,
        workspaceFolderUri: parseURIString(this.workspaceFolder.uri),
      });

      return submodules;
    } catch {
      // File doesn't exist or there was an error parsing
      log.info(
        `[Repository] No .gitmodules file found or error parsing at ${gitmodulesFileUri.toString()}`,
      );
      return [];
    }
  }

  /**
   * Checks if a URI points to a .gitmodules file
   */
  static isGitModulesFile(file: URI): boolean {
    return isGitModulesFile(file);
  }

  static getDefaultGitDirUri(repoUri: URI): URI {
    return fsPathToUri(path.join(repoUri.fsPath, '.git'));
  }

  async #resolveExcludeFileFromGitDir(): Promise<URI | undefined> {
    const excludePath = path.join(this.gitDirUri.fsPath, 'info', 'exclude');
    const { access } = this.#fsClient.promises as {
      access?: typeof import('fs/promises').access;
    };
    if (!access) {
      return undefined;
    }

    try {
      await access(excludePath);
      return fsPathToUri(excludePath);
    } catch {
      return undefined;
    }
  }
}
