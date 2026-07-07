import { createInterfaceId, Injectable } from '@gitlab/needle';
import { DuoChatAIRequest } from '@gitlab-org/ai-context';
import {
  parseGitLabRemote,
  RepositoryDiscoveryService,
  StatelessRepository,
} from '@gitlab-org/repositories';
import { Logger, withPrefix } from '@gitlab-org/logging';
import { WorkspaceFolder } from 'vscode-languageserver-protocol';
import { ProjectService, tryParseGitLabGid, type GitLabGID } from '@gitlab-org/core';
import { ConfigService } from '@gitlab-org/config';
import { URI } from 'vscode-uri';
import { filter } from 'fuzzaldrin-plus';
import { isEqual } from 'lodash';
import { GitLabProjectId } from '../../../api_types';

/**
 * Repository data structure returned by the strategy before formatting
 */
export interface RepositoryContextItemResult {
  id: GitLabGID;
  name: string;
  pathWithNamespace: string;
  webUrl: string;
  description: string;
  numericId: GitLabProjectId;
}

/**
 * Strategy interface for retrieving repository data from different sources
 */
export interface RepositoryContextItemStrategy {
  /**
   * Get initial repository data when no query is provided.
   * This method is called when the query is blank or empty.
   */
  getInitialRepositories(query: DuoChatAIRequest): Promise<RepositoryContextItemResult[]>;

  /**
   * Search repository data based on a query.
   * This method performs searching on the available repositories.
   */
  searchRepositories(query: DuoChatAIRequest): Promise<RepositoryContextItemResult[]>;

  /**
   * Check if this strategy is supported in the current environment.
   */
  isSupported(): boolean;

  /**
   * Minimum GitLab version required for this strategy.
   * Strategies requiring newer versions are preferred over those requiring older versions.
   * Return null for strategies that work with any version.
   */
  getMinimumVersion(): string | null;
}

export const RepositoryContextItemStrategy = createInterfaceId<RepositoryContextItemStrategy>(
  'RepositoryContextItemStrategy',
);

/**
 * Strategy for retrieving repository data from the workspace.
 * Gets repositories from the current workspace, extracts GitLab remote information,
 * and returns repository data for formatting by the provider.
 */
@Injectable(RepositoryContextItemStrategy, [
  RepositoryDiscoveryService,
  ConfigService,
  ProjectService,
  Logger,
])
export class WorkspaceRepositoryContextItemStrategy implements RepositoryContextItemStrategy {
  readonly #repositoryService: RepositoryDiscoveryService;

  readonly #configService: ConfigService;

  readonly #projectService: ProjectService;

  readonly #logger: Logger;

  constructor(
    repositoryService: RepositoryDiscoveryService,
    configService: ConfigService,
    projectService: ProjectService,
    logger: Logger,
  ) {
    this.#repositoryService = repositoryService;
    this.#configService = configService;
    this.#projectService = projectService;
    this.#logger = withPrefix(logger, '[WorkspaceRepositoryContextItemStrategy]');
  }

  // Cache for storing the most recent repository data for use in search
  #cachedRepositories: RepositoryContextItemResult[] | null = null;

  #lastQueryWorkspaceFolders: WorkspaceFolder[] | null = null;

  // Workspace strategy is always supported since it only depends on local workspace.
  isSupported(): boolean {
    return true;
  }

  getMinimumVersion(): string | null {
    return null;
  }

  async getInitialRepositories(query: DuoChatAIRequest): Promise<RepositoryContextItemResult[]> {
    this.#logger.debug('getting repositories from workspace folders');

    const { workspaceFolders } = query;
    const instanceUrl = (this.#configService.get('baseUrl') as string) || 'https://gitlab.com';

    if (!workspaceFolders?.length) {
      this.#logger.debug('No workspace folders configured');
      return [];
    }

    const projectPathToRemoteMap = await this.#discoverWorkspaceRepositories(
      workspaceFolders,
      instanceUrl,
    );
    const allProjectPaths = Array.from(projectPathToRemoteMap.keys());
    const duoEligibleProjects = await this.#filterToProjectsWithDuoEligible(allProjectPaths);

    this.#logger.debug(
      `Found ${allProjectPaths.length} workspace repositories, ${duoEligibleProjects.length} have code embeddings enabled`,
    );

    const repositories = this.#createRepositoryContextItemResult(
      duoEligibleProjects,
      projectPathToRemoteMap,
    );
    this.#cachedRepositories = repositories;
    this.#lastQueryWorkspaceFolders = workspaceFolders;

    return repositories;
  }

  // Searches only within workspace repositories
  async searchRepositories(query: DuoChatAIRequest): Promise<RepositoryContextItemResult[]> {
    this.#logger.debug('searching repositories with query:', query.query);

    let repositoriesToSearch: RepositoryContextItemResult[];

    if (
      this.#cachedRepositories &&
      isEqual(this.#lastQueryWorkspaceFolders, query.workspaceFolders || null)
    ) {
      this.#logger.debug('Using cached repository data for search');
      repositoriesToSearch = this.#cachedRepositories;
    } else {
      this.#logger.debug('No cache available, fetching fresh repository data for search');
      repositoriesToSearch = await this.getInitialRepositories(query);
    }

    if (!query.query || query.query.trim() === '') {
      return repositoriesToSearch;
    }

    const searchableItems = repositoriesToSearch.map((repo) => ({
      repo,
      searchableText: `${repo.name} ${repo.pathWithNamespace}`,
    }));

    const searchableStrings = searchableItems.map(
      (searchableItem) => searchableItem.searchableText,
    );
    const filteredStrings = filter(searchableStrings, query.query);

    const filteredRepositories = filteredStrings
      .map((filteredString) => {
        const searchableItem = searchableItems.find(
          (item) => item.searchableText === filteredString,
        );
        return searchableItem?.repo;
      })
      .filter((repo): repo is RepositoryContextItemResult => repo !== undefined);

    this.#logger.debug(
      `Found ${filteredRepositories.length} repositories matching query "${query.query}" out of ${repositoriesToSearch.length} total`,
    );

    return filteredRepositories;
  }

  /**
   * Filters workspace projects to only include those that are Duo eligible.
   * @param projectPaths Array of project full paths from workspace repositories
   * @returns Array of projects that are Duo eligible
   */
  async #filterToProjectsWithDuoEligible(
    projectPaths: string[],
  ): Promise<{ id: GitLabGID; fullPath: string }[]> {
    if (projectPaths.length === 0) return [];

    try {
      const projectsWithIds = await this.#projectService.getProjectIdsFromPaths(projectPaths);
      if (projectsWithIds.length === 0) {
        return [];
      }

      const projectIds = projectsWithIds.map((project) => project.id);
      const projectsWithEmbeddings =
        await this.#projectService.filterToProjectsWithDuoEligible(projectIds);
      return projectsWithEmbeddings;
    } catch (error) {
      this.#logger.warn('Failed to filter duo eligible projects', error);
      return [];
    }
  }

  /**
   * Discovers GitLab repositories from workspace folders and extracts their remote information.
   * @param workspaceFolders Array of workspace folders to scan
   * @param instanceUrl GitLab instance URL for filtering remotes
   * @returns Map of project paths to their remote information
   */
  async #discoverWorkspaceRepositories(
    workspaceFolders: WorkspaceFolder[],
    instanceUrl: string,
  ): Promise<Map<string, ReturnType<typeof parseGitLabRemote>>> {
    const repositoryPromises = workspaceFolders.map(async (workspaceFolder) => {
      const workspacePath = URI.parse(workspaceFolder.uri).fsPath;
      const repositories = await this.#repositoryService.getRepositoriesForWorkspace(workspacePath);
      return repositories.map((repository) => ({ repository, workspaceFolder }));
    });

    const repositoryArrays = await Promise.all(repositoryPromises);
    const allRepositories: { repository: StatelessRepository; workspaceFolder: WorkspaceFolder }[] =
      repositoryArrays.flat();

    const repositoryResults = await Promise.allSettled(
      allRepositories.map(async ({ repository }) => {
        try {
          const remotes = await repository.listRemotes();
          const gitLabRemotes = remotes
            .map((remote) => parseGitLabRemote(remote.url, instanceUrl))
            .filter((remote): remote is NonNullable<typeof remote> => remote !== undefined);
          return gitLabRemotes;
        } catch (error) {
          this.#logger.debug(`Failed to process repository, ignoring`, error);
          return [];
        }
      }),
    );

    const projectPathToRemoteMap = new Map<string, ReturnType<typeof parseGitLabRemote>>();

    for (const result of repositoryResults) {
      if (result.status === 'fulfilled') {
        for (const remote of result.value) {
          const path = remote.namespaceWithPath;
          if (!projectPathToRemoteMap.has(path)) {
            projectPathToRemoteMap.set(path, remote);
          }
        }
      }
    }

    return projectPathToRemoteMap;
  }

  /**
   * Creates RepositoryContextItemResult objects from projects with code embeddings.
   * @param projectsWithEmbeddings Array of projects that have code embeddings enabled
   * @param projectPathToRemoteMap Map of project paths to their remote information
   * @returns Array of RepositoryContextItemResult objects
   */
  #createRepositoryContextItemResult(
    projectsWithEmbeddings: { id: GitLabGID; fullPath: string }[],
    projectPathToRemoteMap: Map<string, ReturnType<typeof parseGitLabRemote>>,
  ): RepositoryContextItemResult[] {
    const repositories: RepositoryContextItemResult[] = [];

    for (const project of projectsWithEmbeddings) {
      const remote = projectPathToRemoteMap.get(project.fullPath);
      const numericId = tryParseGitLabGid(project.id);

      if (remote && typeof numericId === 'number') {
        repositories.push({
          id: project.id,
          name: remote.projectPath,
          pathWithNamespace: remote.namespaceWithPath,
          webUrl: `https://${remote.host}/${remote.namespaceWithPath}`,
          description: '',
          numericId,
        });
      }
    }

    return repositories;
  }
}
