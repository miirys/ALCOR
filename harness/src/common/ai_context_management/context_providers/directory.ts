import { Injectable } from '@gitlab/needle';
import { WorkspaceFolder } from 'vscode-languageserver-protocol';
import { Utils } from 'vscode-uri';
import {
  AbstractAIContextProvider,
  AIContextItem,
  AIContextItemMetadata,
  DuoChatAIRequest,
} from '@gitlab-org/ai-context';
import { GID_NAMESPACE_PROJECT, GitLabGID, ProjectService, toGitLabGid } from '@gitlab-org/core';
import { Logger, withPrefix } from '@gitlab-org/logging';
import { DuoFeature } from '@gitlab-org/duo-feature-access';
import { DuoProjectAccessChecker } from '../../services/duo_access';
import { log } from '../../log';
import { AIContextProvider } from '..';
import { DuoProjectStatus } from '../../services/duo_access/project_access_checker';
import { asyncDebounce, type AsyncDebouncedFunction } from '../../utils/async_debounce';
import { DirectorySearchResult, DirectoryService } from '../../services/fs/directory_service';

type DirectoryMetadata = AIContextItemMetadata & {
  subType: 'directory';
  relativePath?: string;
  workspaceFolder?: WorkspaceFolder;
  namespace: string;
  projectPathWithNamespace: string;
  projectId?: GitLabGID; // Required by the backend when we send the context, but not when we display it in the menu
};

export type DirectoryAIContextItem = AIContextItem & {
  category: 'directory';
  metadata: DirectoryMetadata;
};

export interface DirectoryContextProvider
  extends AbstractAIContextProvider<DirectoryAIContextItem> {}

@Injectable(AIContextProvider, [Logger, DirectoryService, DuoProjectAccessChecker, ProjectService])
export class DefaultDirectoryContextProvider
  extends AbstractAIContextProvider<DirectoryAIContextItem>
  implements DirectoryContextProvider
{
  #directoryService: DirectoryService;

  #projectAccessChecker: DuoProjectAccessChecker;

  #projectService: ProjectService;

  #debouncedSearchDirectories: AsyncDebouncedFunction<
    (query: DuoChatAIRequest) => Promise<DirectoryAIContextItem[]>
  >;

  chatRequiredFeature = DuoFeature.IncludeRepositoryContext;

  constructor(
    logger: Logger,
    directoryService: DirectoryService,
    projectAccessChecker: DuoProjectAccessChecker,
    projectService: ProjectService,
  ) {
    super('directory', withPrefix(logger, '[DirectoryContextProvider]'));
    this.#directoryService = directoryService;
    this.#projectAccessChecker = projectAccessChecker;
    this.#debouncedSearchDirectories = asyncDebounce(this.#searchDirectories.bind(this), 50);
    this.#projectService = projectService;
  }

  async searchContextItems(searchRequest: DuoChatAIRequest): Promise<DirectoryAIContextItem[]> {
    return this.#debouncedSearchDirectories(searchRequest);
  }

  async retrieveContextItemsWithContent(): Promise<DirectoryAIContextItem[]> {
    const items = await this.getSelectedContextItems();

    const results = await Promise.allSettled(
      items.map(async (item) => {
        const { projectPathWithNamespace } = item.metadata;
        const project =
          await this.#projectService.getProjectFromPathWithNamespace(projectPathWithNamespace);

        const itemWithProjectId = {
          ...item,
          metadata: {
            ...item.metadata,
            projectId: toGitLabGid(GID_NAMESPACE_PROJECT, project.id),
          },
        };

        return this.getItemWithContent(itemWithProjectId);
      }),
    );

    const successfulItems: DirectoryAIContextItem[] = [];

    for (const result of results) {
      if (result.status === 'fulfilled') {
        successfulItems.push(result.value);
      } else {
        log.error(`[DirectoryContextProvider] Failed to process context item`, result.reason);
      }
    }

    return successfulItems;
  }

  async getItemWithContent(item: DirectoryAIContextItem): Promise<DirectoryAIContextItem> {
    if (item.content) {
      return item;
    }

    const content =
      `Directory Path: "${item.metadata.relativePath}"\n` +
      `Project Global ID: "${item.metadata.projectId}"\n` +
      `Project Path: "${item.metadata.projectPathWithNamespace}"`;

    return {
      ...item,
      content,
    };
  }

  async #searchDirectories(query: DuoChatAIRequest): Promise<DirectoryAIContextItem[]> {
    const directoryResults = await this.#directoryService.searchDirectories(
      query.query,
      query?.workspaceFolders ?? [],
    );

    log.info(`[DirectoryContextProvider] Found ${directoryResults.length} directory results`);

    return this.#convertSearchResultsToAIContextItems(directoryResults);
  }

  #convertSearchResultsToAIContextItems(
    directoryResults: DirectorySearchResult[],
  ): DirectoryAIContextItem[] {
    return directoryResults.reduce<DirectoryAIContextItem[]>((acc, result) => {
      const { project: projectFromChecker, status } = this.#projectAccessChecker.checkProjectStatus(
        result.uri.toString(),
        result.workspaceFolder,
      );
      const enabled = status === DuoProjectStatus.DuoEnabled;

      if (!projectFromChecker) {
        log.error(
          `[DirectoryContextProvider] Project access checker found no project for ${result.uri}`,
        );

        return acc;
      }

      const projectPathWithNamespace = projectFromChecker?.namespaceWithPath;

      acc.push({
        id: result.uri.toString(),
        category: 'directory' as const,
        metadata: {
          enabled,
          disabledReasons: enabled ? [] : ['project disabled'],
          title: Utils.basename(result.uri) || result.relativePath || 'root',
          projectPathWithNamespace,
          namespace: projectFromChecker?.namespace,
          icon: 'folder',
          secondaryText: result.relativePath || '.',
          subType: 'directory',
          subTypeLabel: 'Directory',
          relativePath: result.relativePath,
          workspaceFolder: result.workspaceFolder,
        },
      });

      return acc;
    }, []);
  }
}
