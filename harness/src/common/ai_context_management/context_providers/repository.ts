import { collection, Implements, Service, ServiceLifetime } from '@gitlab/needle';
import { DuoFeature } from '@gitlab-org/duo-feature-access';
import {
  AbstractAIContextProvider,
  AIContextItem,
  AIContextItemMetadata,
  DuoChatAIRequest,
} from '@gitlab-org/ai-context';
import { type ApiReconfiguredData, type GitLabGID, GitLabApiService } from '@gitlab-org/core';
import { Logger, withPrefix } from '@gitlab-org/logging';
import { log } from '../../log';
import { DuoProjectAccessChecker } from '../../services/duo_access';
import { DuoProjectStatus } from '../../services/duo_access/project_access_checker';
import { asyncDebounce, type AsyncDebouncedFunction } from '../../utils/async_debounce';
import { AIContextProvider } from '..';
import {
  type RepositoryContextItemResult,
  RepositoryContextItemStrategy,
} from './strategies/workspace_repository_context_item_strategy';

export type RepositoryMetadata = AIContextItemMetadata & {
  icon: 'project';
  subTypeLabel: 'Repository';
  name: string;
  description: string;
  pathWithNamespace: string;
  webUrl: string;
};

export interface RepositoryAIContextItem extends AIContextItem {
  id: GitLabGID;
  category: 'repository';
  metadata: RepositoryMetadata;
}

export interface RepositoryContextProvider
  extends AbstractAIContextProvider<RepositoryAIContextItem> {}

const MAX_SEARCH_RESULTS = 25;

@Service({
  dependencies: [
    Logger,
    DuoProjectAccessChecker,
    collection(RepositoryContextItemStrategy),
    GitLabApiService,
  ],
  lifetime: ServiceLifetime.Transient,
})
@Implements(AIContextProvider)
export class DefaultRepositoryContextProvider
  extends AbstractAIContextProvider<RepositoryAIContextItem>
  implements RepositoryContextProvider
{
  readonly #duoProjectAccessChecker: DuoProjectAccessChecker;

  readonly #repositoryContextItemStrategies: RepositoryContextItemStrategy[];

  #repositoryContextItemStrategy: RepositoryContextItemStrategy | undefined;

  readonly #debouncedSearchRepositories: AsyncDebouncedFunction<
    (query: DuoChatAIRequest) => Promise<RepositoryAIContextItem[]>
  >;

  #apiReconfiguredDisposable: { dispose: () => void };

  chatRequiredFeature = DuoFeature.IncludeRepositoryContext;

  constructor(
    logger: Logger,
    duoProjectAccessChecker: DuoProjectAccessChecker,
    repositoryContextItemStrategies: RepositoryContextItemStrategy[],
    gitlabApiService: GitLabApiService,
  ) {
    super('repository', withPrefix(logger, '[RepositoryContextProvider]'));
    this.#duoProjectAccessChecker = duoProjectAccessChecker;
    this.#repositoryContextItemStrategies = repositoryContextItemStrategies;

    // Select initial strategy
    this.#selectBestStrategy();

    // Re-evaluate when API is reconfigured (instance version becomes available)
    this.#apiReconfiguredDisposable = gitlabApiService.onApiReconfigured(
      (data: ApiReconfiguredData) => {
        if (data.isInValidState) {
          this.#selectBestStrategy();
        }
      },
    );

    this.#debouncedSearchRepositories = asyncDebounce(this.#searchRepositories.bind(this), 250);
  }

  dispose(): void {
    this.#apiReconfiguredDisposable.dispose();
  }

  async searchContextItems(query: DuoChatAIRequest): Promise<RepositoryAIContextItem[]> {
    if (!this.#repositoryContextItemStrategy) {
      return [];
    }

    if (!query.query) {
      const results = await this.#repositoryContextItemStrategy.getInitialRepositories(query);
      return this.#handleContextItemResults(results);
    }

    return this.#debouncedSearchRepositories(query);
  }

  async retrieveContextItemsWithContent(): Promise<RepositoryAIContextItem[]> {
    const selectedItems = await this.getSelectedContextItems();
    return Promise.all(selectedItems.map((item) => this.getItemWithContent(item)));
  }

  async getItemWithContent(item: RepositoryAIContextItem): Promise<RepositoryAIContextItem> {
    if (item.content) {
      return item;
    }

    const content =
      `Project Path: "${item.metadata.pathWithNamespace}"\n` +
      `Project Name: "${item.metadata.name}"\n` +
      `Project Description: "${item.metadata.description}"`;

    return {
      ...item,
      content,
    };
  }

  /**
   * Selects the best supported strategy based on minimum version requirements.
   * Strategies requiring newer versions are preferred as they use newer APIs.
   */
  #selectBestStrategy(): void {
    const supportedStrategy = this.#repositoryContextItemStrategies
      .filter((strategy) => strategy.isSupported())
      .sort((a, b) => {
        // Treat null as '0.0.0' so it sorts last
        const versionA = a.getMinimumVersion() ?? '0.0.0';
        const versionB = b.getMinimumVersion() ?? '0.0.0';
        return versionB.localeCompare(versionA, undefined, { numeric: true });
      })[0];

    if (!supportedStrategy) {
      this.logger.warn(
        'No supported repository context strategy found, repository context will be unavailable',
      );
      this.#repositoryContextItemStrategy = undefined;
      return;
    }

    this.#repositoryContextItemStrategy = supportedStrategy;
  }

  /**
   * Searches repositories using the configured strategy and formats results.
   * Limits results to MAX_SEARCH_RESULTS.
   */
  async #searchRepositories(query: DuoChatAIRequest): Promise<RepositoryAIContextItem[]> {
    if (!this.#repositoryContextItemStrategy) {
      return [];
    }

    try {
      const results = await this.#repositoryContextItemStrategy.searchRepositories(query);
      const repositories = await this.#handleContextItemResults(results);

      log.debug(
        `[RepositoryContextProvider] found ${repositories.length} results. Max allowed: ${MAX_SEARCH_RESULTS}`,
      );

      return repositories.slice(0, MAX_SEARCH_RESULTS);
    } catch (error) {
      log.error('[RepositoryContextProvider] search failed.', error);
      return [];
    }
  }

  /**
   * Transforms repository results into formatted AI context items.
   * Checks project access status and adds appropriate metadata for each repository.
   */
  async #handleContextItemResults(
    repositories: RepositoryContextItemResult[],
  ): Promise<RepositoryAIContextItem[]> {
    const projectIds = repositories.map((repo) => repo.numericId).filter((id) => id > 0);
    const statuses = await this.#duoProjectAccessChecker.checkProjectStatusesByIds(projectIds);

    const resultsPromises = repositories.map(async (repo) => {
      const status = statuses[repo.numericId];
      const enabled = status === DuoProjectStatus.DuoEnabled;

      return {
        id: repo.id,
        category: 'repository',
        metadata: {
          enabled,
          disabledReasons: enabled ? [] : ['project disabled'],
          subType: 'repository',
          subTypeLabel: 'Repository',
          icon: 'project',
          title: repo.name,
          secondaryText: repo.pathWithNamespace,
          webUrl: repo.webUrl,
          name: repo.name,
          pathWithNamespace: repo.pathWithNamespace,
          description: repo.description,
        },
      } satisfies RepositoryAIContextItem;
    });

    const results = await Promise.all(resultsPromises);
    return results;
  }
}
