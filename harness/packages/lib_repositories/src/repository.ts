import { WorkspaceFolder } from 'vscode-languageserver-protocol';
import { URI } from 'vscode-uri';
import { Disposable } from '@gitlab-org/disposable';
import { GitSubmodule } from './submodule_parser';

export type RepoFileUri = URI;
export type RepoDirectoryUri = URI;
export type RepositoryUri = URI;

/**
 * RepositoryFile represents a file in the repository.
 *
 * These should not be modified directly.
 * Use the `Repository.setFile` method to update the file.
 */
export type RepositoryFile = {
  uri: RepoFileUri;
  repositoryUri: RepositoryUri;
  isIgnored: boolean;
  workspaceFolder: WorkspaceFolder;
  dirUri: () => RepoDirectoryUri;
};

/**
 * RepositoryDirectory represents a directory in the repository.
 *
 * These should not be modified directly.
 * Use the `Repository.setDirectory` method to update the directory.
 *
 * Note: We obtain `RepositoryDirectory`s through the `basename` of the `RepositoryFile`s during initialization
 * in the `RepositoryService.#setWorkspaceRepositories` method.
 */
export type RepositoryDirectory = {
  uri: RepoDirectoryUri;
  repositoryUri: RepositoryUri;
  isIgnored: boolean;
  workspaceFolder: WorkspaceFolder;
};

export type GetFileOptions = {
  excludeGitFolder?: boolean;
  excludeIgnored?: boolean;
  glob?: string;
};

export type GitFiles = {
  ignoreFiles: Map<URI, string>;
  excludeFile: URI | undefined;
  trackedFiles: Set<string>;
};

export type GitRemote = { remote: string; url: string };

export interface Repository extends Disposable {
  readonly workspaceFolder: WorkspaceFolder;
  readonly uri: URI;
  readonly configFileUri: URI;
  readonly gitDirUri: URI;

  isFileIgnored(fileUri: URI): boolean;
  isDirectoryIgnored(directoryUri: URI): boolean;
  setFile(fileUri: URI): RepositoryFile;
  setDirectory(directoryUri: URI): RepositoryDirectory;
  getFile(fileUri: URI, options?: GetFileOptions): RepositoryFile | undefined;
  getFiles(options?: GetFileOptions): RepositoryFile[];
  getDirectory(directoryUri: URI, options?: GetFileOptions): RepositoryDirectory | undefined;
  removeFile(fileUri: URI): void;
  removeFilesUnderDirectory(directoryUri: URI): RepositoryFile[];
  getCurrentTreeFiles(options?: GetFileOptions): RepositoryFile[];
  getCurrentTreeFile(fileUri: URI): RepositoryFile | undefined;
  getCurrentTrackedFiles(): string[];
  setupGitForRepository(files: URI[]): Promise<GitFiles | Error>;
  refreshTrackedFiles(options?: { immediate?: boolean }): Promise<void> | undefined;
  getCurrentBranch(): Promise<string>;
  getTrackingBranchName(): Promise<string | undefined>;
  getHeadRef(): Promise<string>;
  listBranches(): Promise<string[]>;
  getMainBranch(): Promise<string>;
  getGitSubModulesFileUri(): URI | undefined;
  getSubmodules(): Promise<GitSubmodule[]>;
}
