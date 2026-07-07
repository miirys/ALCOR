import { WorkspaceFileUpdate } from '@gitlab-org/fs';
import { createInterfaceId } from '@gitlab/needle';
import { Disposable, WorkspaceFolder } from 'vscode-languageserver-protocol';
import { URI } from 'vscode-uri';
import { GetFileOptions, Repository, RepositoryFile } from './repository';
import { GitSubmodule } from './submodule_parser';
import { StatelessRepository } from './stateless_repository';

export type FolderUriString = string;
export type RepoUriString = string;
export type RepositoryMap = Map<RepoUriString, Repository>;

export interface RepositoryDiscoveryService {
  /**
   * Find a matching repository for a file within a workspace folder
   */
  // FIXME: this probably shouldn't be written this way, matching repositories should not be responsibility of the discovery service
  // we could do something like `getRepositoriesForWorkspace().filter(r => r.contains(fileUri))`
  getMatchingRepository(
    filePath: string,
    workspaceFolderPath: string,
  ): Promise<StatelessRepository | undefined>;
  /**
   * Get all repositories in a workspace folder
   */
  getRepositoriesForWorkspace(workspaceFolderPath: string): Promise<StatelessRepository[]>;

  /**
   * Get all repositories across multiple workspace folders.
   * Returns a map associating each repository with its containing workspace folder.
   */
  getRepositoriesForWorkspaces(
    workspaceFolders: WorkspaceFolder[],
  ): Promise<Map<StatelessRepository, WorkspaceFolder>>;

  /**
   * Finds the root directory of a repository, given a path which is a subdirectory in that repository.
   */
  findRepositoryRoot(path: string): Promise<string>;
}

/**
 * @deprecated Use RepositoryDiscoveryService instead.
 */
export interface RepositoryService extends Disposable {
  /**
   * Find a matching repository for a file within a workspace folder
   */
  // FIXME: this probably shouldn't be written this way, matching repositories should not be responsibility of the discovery service
  // we could do something like `getRepositoriesForWorkspace().filter(r => r.contains(fileUri))`
  getMatchingRepository(
    fileUri: URI,
    workspaceFolderUri: FolderUriString,
  ): Promise<Repository | undefined>;

  /**
   * Get all repositories in a workspace folder
   */
  getRepositoriesForWorkspace(workspaceFolderUri: FolderUriString): Promise<Repository[]>;
  /**
   * Emitted when the workspace repositories are being indexed.
   * This is emitted before the indexing is complete.
   *
   * You can use this as a signal for when indexing for a particular
   * workspace folder has started.
   */
  onWorkspaceRepositoriesStart(listener: (workspaceFolder: WorkspaceFolder) => void): Disposable;

  /**
   * Emitted when the workspace repositories have been set.
   * This is emitted after the indexing is complete.
   *
   * You can use this as a signal for when indexing for a particular
   * workspace folder has completed.
   */
  onWorkspaceRepositoriesFinished(listener: (workspaceFolder: WorkspaceFolder) => void): Disposable;

  /**
   * Subscribe to file change events
   */
  onFileChange(listener: (fileEvent: WorkspaceFileUpdate) => void): Disposable;

  /**
   * Get a repository file for a specific URI
   */
  getRepositoryFileForUri(
    fileUri: URI,
    repositoryUri: URI,
    workspaceFolder: WorkspaceFolder,
  ): RepositoryFile | null;

  /**
   * Get all current files for a repository within a workspace folder
   */
  getCurrentFilesForRepository(
    repositoryUri: URI,
    workspaceFolderUri: FolderUriString,
    options?: GetFileOptions,
  ): RepositoryFile[];

  /**
   * Get all current files across all repositories in a workspace folder
   */
  getCurrentFilesForWorkspace(
    workspaceFolderUri: FolderUriString,
    options?: GetFileOptions,
  ): RepositoryFile[];

  /**
   * Get a specific repository within a workspace folder
   */
  getRepositoryForWorkspace(
    workspaceFolderUri: FolderUriString,
    repositoryUri: URI,
  ): Repository | undefined;

  /**
   * Get the repository for the currently active document
   */
  getRepositoryForActiveDocument(): Repository | undefined;

  /**
   * Get all submodules for a repository
   * @param repositoryUri URI of the repository
   * @param workspaceFolderUri The workspace folder URI containing the repository
   * @returns Promise resolving to an array of `GitSubmodule` objects, or undefined if repository not found
   */
  getSubmodulesForRepository(
    repositoryUri: URI,
    workspaceFolderUri: FolderUriString,
  ): Promise<GitSubmodule[] | undefined>;
}

export const RepositoryService = createInterfaceId<RepositoryService>('RepositoryService');
export const RepositoryDiscoveryService = createInterfaceId<RepositoryDiscoveryService>(
  'RepositoryDiscoveryService',
);
