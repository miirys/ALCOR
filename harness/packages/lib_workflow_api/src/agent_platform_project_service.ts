import { createInterfaceId, Injectable } from '@gitlab/needle';
import {
  GitLabApiService,
  RepositoryProvider,
  diffEmitter,
  EventEmitterImpl,
  EventListener,
} from '@gitlab-org/core';
import { Logger, withPrefix } from '@gitlab-org/logging';
import { Disposable } from '@gitlab-org/disposable';
import { gql } from 'graphql-request';
import { AgentPlatformProjectStore } from './agent_platform_project_store';

interface GqlProjectData {
  project: {
    id: string;
    duoAgenticChatAvailable: boolean;
    duoFeaturesEnabled: boolean;
    namespace: {
      id: string;
      fullPath: string;
    };
  };
  rootNamespace: {
    id: string;
  };
}

interface ProjectData {
  duoAgenticChatAvailable: boolean;
  duoFeaturesEnabled: boolean;
  projectId: string | null;
  namespaceId: string | null;
  rootNamespaceId: string | null;
}

export type AgentPlatformRepository = {
  type: 'single' | 'multiple' | 'selected';
  rootFsPath: string;
  folderName: string;
  projects: {
    id: string | null;
    name: string;
    namespaceWithPath: string;
    remoteName: string;
    duoAgenticChatAvailable: boolean;
    duoFeaturesEnabled: boolean;
    namespaceId: string | null;
    rootNamespaceId: string | null;
  }[];
};

export type AgentPlatformRepositories = {
  repositories: AgentPlatformRepository[];
};

/**
 * Service to access workspace repositories with their Agent Platform projects
 */
export interface AgentPlatformProjectService {
  /**
   * Get all repositories with their projects, enriched with Duo Agentic Chat availability
   */
  getRepositories(): Promise<AgentPlatformRepositories>;

  /**
   * Set the selected project for a specific repository
   * @param repositoryPath - The root filesystem path of the repository
   * @param namespaceWithPath - The GitLab project namespace path (e.g., 'gitlab-org/gitlab')
   */
  setSelectedProject(repositoryPath: string, namespaceWithPath: string): Promise<void>;

  /**
   * Get the currently selected project for a specific repository
   * @param repositoryPath - The root filesystem path of the repository
   * @returns The selected project namespace path, or null if none selected
   */
  getSelectedProject(repositoryPath: string): Promise<string | null>;

  /**
   * Get project data including availability and IDs
   * @param projectPath - The GitLab project namespace path (e.g., 'gitlab-org/gitlab')
   * @returns Object with availability status, project ID, namespace ID, and root namespace ID
   */
  getProjectData(projectPath: string): Promise<ProjectData>;

  /**
   * Listen for changes to repositories
   * @param listener - Callback function that receives updated repositories
   * @returns Disposable to unsubscribe from changes
   */
  onRepositoriesChange(listener: EventListener<AgentPlatformRepositories>): Disposable;
}

export const AgentPlatformProjectService = createInterfaceId<AgentPlatformProjectService>(
  'AgentPlatformProjectService',
);

@Injectable(AgentPlatformProjectService, [
  RepositoryProvider,
  AgentPlatformProjectStore,
  GitLabApiService,
  Logger,
])
export class DefaultAgentPlatformProjectService implements AgentPlatformProjectService {
  #repositoryProvider: RepositoryProvider;

  #selectedProjectStore: AgentPlatformProjectStore;

  #api: GitLabApiService;

  #logger: Logger;

  #eventEmitter = diffEmitter(new EventEmitterImpl<AgentPlatformRepositories>());

  #repositoryProviderDisposable: Disposable | null = null;

  constructor(
    repositoryProvider: RepositoryProvider,
    selectedProjectStore: AgentPlatformProjectStore,
    api: GitLabApiService,
    logger: Logger,
  ) {
    this.#repositoryProvider = repositoryProvider;
    this.#selectedProjectStore = selectedProjectStore;
    this.#api = api;
    this.#logger = withPrefix(logger, '[AgentPlatformProjectService]');
    this.#repositoryProviderDisposable = this.#repositoryProvider.onRepositoriesChange(() =>
      this.#notifyRepositoriesChanged(),
    );
  }

  async #notifyRepositoriesChanged(): Promise<void> {
    try {
      const repositories = await this.getRepositories();
      this.#eventEmitter.fire(repositories);
    } catch (error) {
      this.#logger.error(`Error notifying repositories changed: ${String(error)}`);
    }
  }

  onRepositoriesChange = this.#eventEmitter.event;

  async getRepositories(): Promise<AgentPlatformRepositories> {
    const repositories = this.#repositoryProvider.getRepositories();
    this.#logger.debug(
      `Got ${repositories.repositories.length} repositories ${JSON.stringify(repositories, null, 2)}`,
    );

    // Filter out repositories with no projects and transform to UI format
    const enrichedRepositories = await Promise.all(
      repositories.repositories
        .filter((repo) => repo.type !== 'none')
        .map(async (repo) => {
          // Enrich projects with DAP availability
          this.#logger.debug(
            `Checking DAP availability for ${repo.projects?.length || 0} projects in ${repo.repository.folderName}`,
          );

          const enrichedProjects = await Promise.all(
            (repo.projects || []).map(async (project) => {
              const {
                duoAgenticChatAvailable,
                duoFeaturesEnabled,
                projectId,
                namespaceId,
                rootNamespaceId,
              } = await this.getProjectData(project.project.namespaceWithPath);

              this.#logger.debug(
                `Project ${project.project.namespaceWithPath}: duoAgenticChatAvailable = ${duoAgenticChatAvailable}, duoFeaturesEnabled = ${duoFeaturesEnabled}, projectId = ${projectId}, namespaceId = ${namespaceId}, rootNamespaceId = ${rootNamespaceId}`,
              );

              return {
                id: projectId,
                name: project.project.name,
                namespaceWithPath: project.project.namespaceWithPath,
                remoteName: project.pointer.remote.name,
                duoAgenticChatAvailable,
                duoFeaturesEnabled,
                namespaceId,
                rootNamespaceId,
              };
            }),
          );

          return {
            type: repo.type,
            rootFsPath: repo.repository.rootFsPath,
            folderName: repo.repository.folderName,
            projects: enrichedProjects,
          };
        }),
    );

    this.#logger.debug(`Returning ${enrichedRepositories.length} enriched repositories`);
    return { repositories: enrichedRepositories };
  }

  async setSelectedProject(repositoryPath: string, namespaceWithPath: string): Promise<void> {
    this.#logger.debug(`Setting selected project for ${repositoryPath}: ${namespaceWithPath}`);
    await this.#selectedProjectStore.setSelectedProject(repositoryPath, namespaceWithPath);
  }

  async getSelectedProject(repositoryPath: string): Promise<string | null> {
    return this.#selectedProjectStore.getSelectedProject(repositoryPath);
  }

  async getProjectData(projectPath: string): Promise<ProjectData> {
    try {
      this.#logger.debug(`Getting project data for: "${projectPath}"`);

      // Extract root namespace from project path (e.g., 'gitlab-org' from 'gitlab-org/gitlab')
      const rootNamespacePath = projectPath.split('/')[0];

      const response = await this.#api.fetchFromApi<GqlProjectData>({
        type: 'graphql',
        query: gql`
          query getProjectData($projectPath: ID!, $rootNamespacePath: ID!) {
            project(fullPath: $projectPath) {
              id
              duoAgenticChatAvailable
              duoFeaturesEnabled
              namespace {
                id
                fullPath
              }
            }
            rootNamespace: namespace(fullPath: $rootNamespacePath) {
              id
            }
          }
        `,
        variables: { projectPath, rootNamespacePath },
        supportedSinceInstanceVersion: {
          version: '18.1.0',
          resourceName: 'get project data',
        },
      });

      const projectId = response.project?.id ?? null;
      const namespaceId = response.project?.namespace?.id ?? null;
      const rootNamespaceId = response.rootNamespace?.id ?? null;
      const duoAgenticChatAvailable = response.project?.duoAgenticChatAvailable ?? false;
      // `duoFeaturesEnabled` is the project-level "GitLab Duo" toggle.
      const duoFeaturesEnabled = response.project?.duoFeaturesEnabled ?? false;

      return {
        duoAgenticChatAvailable,
        duoFeaturesEnabled,
        projectId,
        namespaceId,
        rootNamespaceId,
      };
    } catch (error) {
      this.#logger.error(`Error for ${projectPath}: ${String(error)}`);
      return {
        duoAgenticChatAvailable: false,
        duoFeaturesEnabled: false,
        projectId: null,
        namespaceId: null,
        rootNamespaceId: null,
      };
    }
  }

  dispose(): void {
    this.#repositoryProviderDisposable?.dispose();
  }
}
