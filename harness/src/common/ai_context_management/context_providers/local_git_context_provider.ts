import { v4 as uuidv4 } from 'uuid';
import { Implements, Service, ServiceLifetime } from '@gitlab/needle';
import { WorkspaceFolder } from 'vscode-languageserver-protocol';
import { filter } from 'fuzzaldrin-plus';
import {
  AbstractAIContextProvider,
  type DuoChatAIRequest,
  type GitContextItem,
} from '@gitlab-org/ai-context';
import { RepositoryService, Repository } from '@gitlab-org/repositories';
import { LsConnection } from '@gitlab-org/core';
import { Logger, withPrefix } from '@gitlab-org/logging';
import { DuoFeature } from '@gitlab-org/duo-feature-access';
import { parseURIString } from '@gitlab-org/fs';
import { AiContextEditorRequests, AIContextProvider } from '..';
import { DuoProjectAccessChecker } from '../../services/duo_access';
import { DuoProjectStatus } from '../../services/duo_access/project_access_checker';
import { log } from '../../log';
import { asyncDebounce, AsyncDebouncedFunction } from '../../utils/async_debounce';

type RepositoryBranches = {
  mainBranch: string;
  currentBranch: string;
  allBranches: string[];
};

export type RepositoryInfo = {
  branches: RepositoryBranches;
  headRef: string;
  repository: Repository;
  name: string;
  enabled: boolean;
  workspaceFolder: WorkspaceFolder;
};

interface LocalGitContextProvider extends AbstractAIContextProvider<GitContextItem> {}

@Service({
  dependencies: [Logger, LsConnection, RepositoryService, DuoProjectAccessChecker],
  lifetime: ServiceLifetime.Transient,
})
@Implements(AIContextProvider)
export class DefaultLocalGitContextProvider
  extends AbstractAIContextProvider<GitContextItem>
  implements LocalGitContextProvider
{
  #lsConnection: LsConnection;

  #repositoryService: RepositoryService;

  #projectAccessChecker: DuoProjectAccessChecker;

  readonly #debouncedSearchIssues: AsyncDebouncedFunction<
    (query: DuoChatAIRequest) => Promise<GitContextItem[]>
  >;

  readonly chatRequiredFeature = DuoFeature.IncludeLocalGitContext;

  constructor(
    logger: Logger,
    lsConnection: LsConnection,
    repositoryService: RepositoryService,
    projectAccessChecker: DuoProjectAccessChecker,
  ) {
    super('local_git', withPrefix(logger, '[LocalGitContextProvider]'));
    this.#lsConnection = lsConnection;
    this.#repositoryService = repositoryService;
    this.#projectAccessChecker = projectAccessChecker;
    this.#debouncedSearchIssues = asyncDebounce(this.#search.bind(this), 50);
  }

  /**
   * Searches for Git context items based on the query.
   *
   * @param query - The AI context search query.
   * @returns A promise that resolves to an array of Git context items.
   */
  async searchContextItems(query: DuoChatAIRequest): Promise<GitContextItem[]> {
    return this.#debouncedSearchIssues(query);
  }

  /**
   * Internal method to search commits and provide context items.
   *
   * @param query - The AI context search query.
   * @returns A promise that resolves to an array of Git context items.
   */
  async #search(query: DuoChatAIRequest): Promise<GitContextItem[]> {
    const uniqueRepositories = new Map<string, Repository>();

    const repositoryPromises = (query?.workspaceFolders ?? []).map(async (workspaceFolder) => {
      const repositories = await this.#repositoryService.getRepositoriesForWorkspace(
        workspaceFolder.uri,
      );
      return repositories;
    });

    const repositoryArrays = await Promise.all(repositoryPromises);
    for (const repositories of repositoryArrays) {
      for (const repository of repositories) {
        uniqueRepositories.set(repository.uri.toString(), repository);
      }
    }

    const repositoryInfos = await Promise.all(
      Array.from(uniqueRepositories.values()).map((repository) =>
        this.#repositoryInfo({ repository, workspaceFolder: repository.workspaceFolder }),
      ),
    );

    const staticPromises = repositoryInfos.map((repositoryInfo) =>
      this.#getStaticOptionsForRepository({
        repositoryInfo,
      }),
    );

    const results = await Promise.all([...staticPromises]);

    const contextItemMap = new Map<string, GitContextItem>();
    const contextItems = results.flat().filter((item) => item !== undefined);

    if (query.query.trim() === '') {
      return contextItems;
    }

    for (const item of contextItems) {
      contextItemMap.set(item.metadata.title, item);
    }

    const fuzzyResults = filter(Array.from(contextItemMap.keys()), query.query, {
      maxResults: 100,
    });

    return fuzzyResults
      .map((result) => contextItemMap.get(result))
      .filter((item) => item !== undefined);
  }

  async #getStaticOptionsForRepository({
    repositoryInfo,
  }: {
    repositoryInfo: RepositoryInfo;
  }): Promise<GitContextItem[]> {
    // Internal to GitLab monolith. This following repositories are under
    // the GitLab Monolith spec folders (tmp/tests/gitlab-test).
    // We ignore these as they are likely unused in the GitLab workspace.
    if (
      repositoryInfo.name === 'gitlab-org/gitlab-test' ||
      repositoryInfo.name === 'gitlab-org/gitlab-test-fork'
    ) {
      return [];
    }

    const { name, enabled, repository, branches, headRef, workspaceFolder } = repositoryInfo;

    const createDiffItem = (branch: string | undefined, title: string): GitContextItem => ({
      id: `diff:${uuidv4()}`,
      category: 'local_git',
      metadata: {
        title,
        enabled,
        subType: 'local_git',
        repositoryUri: repository.uri.toString(),
        repositoryName: name,
        disabledReasons: enabled ? [] : ['Project disabled'],
        gitType: 'diff',
        workspaceFolder,
        selectedBranch: branch,
        icon: 'git',
        secondaryText: `Compare Changes with ${branch ?? headRef}`,
        subTypeLabel: 'Diff',
      },
    });

    const items: GitContextItem[] = [];

    if (branches.currentBranch !== branches.mainBranch) {
      items.push(createDiffItem(branches.mainBranch, `Diff from ${branches.mainBranch}`));
    }

    items.push(createDiffItem(undefined, `Diff from HEAD (working state)`));

    items.push(
      ...branches.allBranches
        .filter((branch) => branch !== branches.mainBranch && branch !== branches.currentBranch)
        .map((branch) => createDiffItem(branch, `Diff from ${branch}`)),
    );

    return items;
  }

  async #repositoryInfo({
    repository,
    workspaceFolder,
  }: {
    repository: Repository;
    workspaceFolder: WorkspaceFolder;
  }): Promise<RepositoryInfo> {
    const { project: projectFromChecker, status } = this.#projectAccessChecker.checkProjectStatus(
      repository.configFileUri.toString(),
      workspaceFolder,
    );

    const name = projectFromChecker
      ? projectFromChecker.namespaceWithPath
      : repository.uri.toString().replace(workspaceFolder.uri, '');

    const [branches, headRef] = await Promise.all([
      this.#branchesForRepository(repository),
      repository.getHeadRef(),
    ]);

    return {
      name,
      enabled: status !== DuoProjectStatus.DuoDisabled,
      branches,
      repository,
      workspaceFolder,
      headRef,
    };
  }

  async #branchesForRepository(
    repository: Repository,
  ): Promise<{ mainBranch: string; currentBranch: string; allBranches: string[] }> {
    const [mainBranch, currentBranch, allBranches] = await Promise.all([
      repository.getMainBranch(),
      repository.getCurrentBranch(),
      repository.listBranches(),
    ]);

    return { mainBranch, currentBranch, allBranches };
  }

  async getItemWithContent(item: GitContextItem): Promise<GitContextItem> {
    const repositoryUri = parseURIString(item.metadata.repositoryUri);
    const repository = this.#repositoryService.getRepositoryForWorkspace(
      item.metadata.workspaceFolder.uri,
      repositoryUri,
    );
    if (!repository) {
      log.error(`[GitContextProvider] Repository for ${repositoryUri.toString()} not found.`);
      return item;
    }

    switch (item.metadata.gitType) {
      case 'diff': {
        const diffString = await this.#lsConnection.sendRequest<string>(
          AiContextEditorRequests.GIT_DIFF,
          {
            repositoryUri: repository.uri.toString(),
            branch: item.metadata.selectedBranch,
          },
        );
        return {
          ...item,
          content: diffString,
        };
      }
      default:
        return item;
    }
  }

  /**
   * Retrieves the selected context items with their content (diffs).
   *
   * @returns A promise that resolves to an array of Git context items with content.
   */
  async retrieveContextItemsWithContent(): Promise<GitContextItem[]> {
    const items = await this.getSelectedContextItems();

    const itemsWithContentPromises = items.map(async (item) => {
      const itemWithContent = await this.getItemWithContent(item);
      return itemWithContent;
    });

    return Promise.all(itemsWithContentPromises);
  }
}
