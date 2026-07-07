import { createInterfaceId, Injectable } from '@gitlab/needle';
import { WorkspaceFolder } from 'vscode-languageserver-protocol';
import { URI, Utils } from 'vscode-uri';
import { filter } from 'fuzzaldrin-plus';
import { RepositoryService } from '@gitlab-org/repositories';
import { getRelativePath } from '@gitlab-org/fs';
import { log } from '../../log';
import { OpenTabsService } from '../../open_tabs/open_tabs_service';

// TODO: Make this configurable
// https://gitlab.com/gitlab-org/gitlab/-/issues/490602
const MAX_RESULTS = 100;
const MAX_DEPTH = 100;

export interface DirectorySearchResult {
  uri: URI;
  workspaceFolder: WorkspaceFolder;
  relativePath?: string;
}

export interface DirectoryService {
  searchDirectories(
    query: string,
    workspaceFolders: WorkspaceFolder[],
  ): Promise<DirectorySearchResult[]>;
}

export const DirectoryService = createInterfaceId<DirectoryService>('DirectoryService');

@Injectable(DirectoryService, [RepositoryService, OpenTabsService])
export class DefaultDirectoryService implements DirectoryService {
  #repositoryService: RepositoryService;

  #openTabsService: OpenTabsService;

  constructor(repositoryService: RepositoryService, openTabsService: OpenTabsService) {
    this.#repositoryService = repositoryService;
    this.#openTabsService = openTabsService;
  }

  /**
   * Search for relevant directories in the current workspace.
   * If the query string is empty, return directories that contain the currently open tabs.
   * Otherwise, use fuzzy matching to find directories in the workspace that are a close match.
   * Includes all directories and subdirectories as separate elements.
   */
  async searchDirectories(
    query: string,
    workspaceFolders: WorkspaceFolder[],
  ): Promise<DirectorySearchResult[]> {
    if (query.trim() === '') {
      return this.#getDirectoriesFromOpenTabs();
    }

    // Get all files from all workspace folders
    const allFiles: { uri: URI; workspaceFolder: WorkspaceFolder }[] = [];

    for (const folder of workspaceFolders) {
      const repositoryFiles = this.#repositoryService.getCurrentFilesForWorkspace(folder.uri, {
        excludeGitFolder: true,
        excludeIgnored: true,
      });

      // Convert to the format expected by getDirectoriesFromFiles
      for (const file of repositoryFiles) {
        allFiles.push({
          uri: file.uri,
          workspaceFolder: folder,
        });
      }
    }

    const allDirectories = this.#getDirectoriesFromFiles(allFiles);

    const directoryPaths = allDirectories.map((dir) => ({
      searchKey: dir.relativePath || Utils.basename(dir.uri) || dir.uri.toString(),
      directory: dir,
    }));

    const filteredItems = filter(directoryPaths, query, {
      key: 'searchKey',
      maxResults: MAX_RESULTS,
      usePathScoring: true,
    });

    log.info(
      `[DirectoryService] Found ${filteredItems.length} fuzzy matches for query "${query}". Max allowed: ${MAX_RESULTS}`,
    );

    return filteredItems.map((item) => item.directory);
  }

  /**
   * Extract unique directory paths from a list of files.
   * Includes all parent directories up to the workspace root as separate elements.
   */
  #getDirectoriesFromFiles(
    files: { uri: URI; workspaceFolder: WorkspaceFolder }[],
  ): DirectorySearchResult[] {
    const directoryPaths = new Set<string>();
    const directoryToWorkspaceMap = new Map<string, WorkspaceFolder>();

    for (const file of files) {
      const fileUri = file.uri;
      const workspaceUri = URI.parse(file.workspaceFolder.uri);

      let currentDir = Utils.dirname(fileUri);

      // Add directories from the file path up to the workspace root
      let depth = 0;
      while (
        currentDir.toString() !== workspaceUri.toString() &&
        currentDir.path !== '/' &&
        depth < MAX_DEPTH // Safety limit to prevent infinite loops
      ) {
        depth++;
        const relativePath = getRelativePath(workspaceUri, currentDir);
        if (relativePath && relativePath !== '.') {
          directoryPaths.add(currentDir.toString());
          directoryToWorkspaceMap.set(currentDir.toString(), file.workspaceFolder);
        }
        currentDir = Utils.dirname(currentDir);
      }
    }

    log.info(`[DirectoryService] Found ${directoryPaths.size} unique directories from files`);

    return Array.from(directoryPaths)
      .map((dirPath): DirectorySearchResult | null => {
        const dirUri = URI.parse(dirPath);
        const workspaceFolder = directoryToWorkspaceMap.get(dirPath);

        if (!workspaceFolder) {
          log.error(`[DirectoryService] No workspace folder found for directory: ${dirPath}`);
          return null;
        }

        const workspaceUri = URI.parse(workspaceFolder.uri);
        const relativePath = getRelativePath(workspaceUri, dirUri);

        return {
          uri: dirUri,
          workspaceFolder,
          relativePath,
        };
      })
      .filter((result): result is DirectorySearchResult => result !== null);
  }

  /**
   * Extract unique directory paths from the currently open tabs.
   * Includes all parent directories up to the workspace root as separate elements.
   */
  async #getDirectoriesFromOpenTabs(): Promise<DirectorySearchResult[]> {
    const openTabs = this.#openTabsService.mostRecentTabs({
      includeCurrentFile: true,
    });

    const files = openTabs
      .filter(
        (tab): tab is typeof tab & { workspaceFolder: NonNullable<typeof tab.workspaceFolder> } =>
          tab.workspaceFolder != null,
      )
      .map((tab) => ({
        uri: URI.parse(tab.uri),
        workspaceFolder: tab.workspaceFolder,
      }));

    const directoryResults = this.#getDirectoriesFromFiles(files);

    log.info(
      `[DirectoryContextProvider] Found ${directoryResults.length} unique directories from open tabs`,
    );

    return directoryResults;
  }
}
