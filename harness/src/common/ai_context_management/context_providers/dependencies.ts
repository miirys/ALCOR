import { filter } from 'fuzzaldrin-plus';
import { Implements, Service, ServiceLifetime } from '@gitlab/needle';
import { Utils } from 'vscode-uri';
import {
  AbstractAIContextProvider,
  DependencyAIContextItem,
  DuoChatAIRequest,
} from '@gitlab-org/ai-context';
import { Repository, RepositoryService } from '@gitlab-org/repositories';
import { Logger, withPrefix } from '@gitlab-org/logging';
import { DuoFeature } from '@gitlab-org/duo-feature-access';
import { AIContextProvider } from '..';
import { log } from '../../log';
import { getRelativePath } from '../../utils/path';
import { DependencyScanner } from './depdendency_scanner/scanner';
import { DependencyLibrary, ParsedDependency } from './depdendency_scanner/types';

interface DependencyContextProvider extends AbstractAIContextProvider<DependencyAIContextItem> {}

@Service({
  // FIXME: [RepositoryService] once the Stateless Repository implements methods needed by depenency scanner, switch to RepositoryDiscoveryService
  dependencies: [Logger, RepositoryService, DependencyScanner],
  lifetime: ServiceLifetime.Transient,
})
@Implements(AIContextProvider)
export class DefaultDependencyContextProvider
  extends AbstractAIContextProvider<DependencyAIContextItem>
  implements DependencyContextProvider
{
  #repositoryService: RepositoryService;

  #dependencyScanner: DependencyScanner;

  chatRequiredFeature = DuoFeature.IncludeDependencyContext;

  constructor(
    logger: Logger,
    repositoryService: RepositoryService,
    dependencyScanner: DependencyScanner,
  ) {
    super('dependency', withPrefix(logger, '[DependencyContextProvider]'));
    this.#repositoryService = repositoryService;
    this.#dependencyScanner = dependencyScanner;
  }

  async searchContextItems(searchRequest: DuoChatAIRequest): Promise<DependencyAIContextItem[]> {
    const items: Promise<DependencyAIContextItem | null>[] = [];
    const repositories: Map<string, Repository> = new Map();
    const repositoryPromises = (searchRequest.workspaceFolders ?? []).map(async (folder) => {
      const folderRepositories = await this.#repositoryService.getRepositoriesForWorkspace(
        folder.uri,
      );
      return Array.from(folderRepositories.values());
    });

    const repositoryArrays = await Promise.all(repositoryPromises);
    for (const folderRepositories of repositoryArrays) {
      for (const repo of folderRepositories) {
        if (repo) repositories.set(repo.uri.path, repo);
      }
    }

    let repositoryPaths = Array.from(repositories.keys());
    if (searchRequest.query) {
      repositoryPaths = filter(repositoryPaths, searchRequest.query);
    }

    log.info(`[DependencyContextProvider] Found ${repositoryPaths.length} repositories.`);

    for (const repoPath of repositoryPaths) {
      const repo = repositories.get(repoPath);
      if (repo) {
        const item = this.#dependencyScanner
          .findDependencies(repo, repo.workspaceFolder)
          .then((deps) => {
            const depsWithLibs = deps.filter((d) => d.libs.length);

            const foundFiles = depsWithLibs
              .map((d) => getRelativePath(d.fileUri.toString(), repo.workspaceFolder))
              .join(', ');

            return {
              id: repo.uri.toString(),
              content: this.dependenciesContent(depsWithLibs),
              category: 'dependency',
              metadata: {
                title: `${Utils.basename(repo.uri)}`,
                secondaryText: foundFiles,
                icon: 'package',
                enabled: true,
                disabledReasons: [],
                subType: 'dependency',
                subTypeLabel: 'Project dependencies',
                libs: deps.map((d) => d.libs).flat(),
              },
            } as DependencyAIContextItem;
          })
          .catch((e) => {
            log.info(`[DependencyContextProvider] Error ${e.toString()}`);
            return null;
          });

        items.push(item);
      }
    }

    log.info(`[DependencyContextProvider] Found ${items.length} dependencies.`);

    return (await Promise.all(items)).filter((item) => {
      return item !== null;
    }) as DependencyAIContextItem[];
  }

  dependenciesContent(deps: ParsedDependency[]): string {
    return JSON.stringify(
      deps.map((d) => ({
        [d.type.lang]: d.libs.map((l: DependencyLibrary) => `${l.name}@${l.version}`),
      })),
    );
  }

  retrieveContextItemsWithContent(): Promise<DependencyAIContextItem[]> {
    return this.getSelectedContextItems();
  }

  getItemWithContent(item: DependencyAIContextItem): Promise<DependencyAIContextItem> {
    return Promise.resolve(item);
  }
}
