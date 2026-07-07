import { Injectable } from '@gitlab/needle';
import { Logger, withPrefix } from '@gitlab-org/logging';
import { SelectedProjectSetting } from '@gitlab-org/persistent-storage';
import {
  NotifyFn,
  GitLabApiService,
  UserService,
  Repository,
  RepositoryState,
  Remote,
  ProjectInRepository,
  GetRepositoriesResponse,
  RepositoryProvider,
  diffEmitter,
  EventEmitterImpl,
} from '@gitlab-org/core';
import { ConfigService } from '@gitlab-org/config';
import { Disposable } from '@gitlab-org/disposable';
import { DuoWorkspaceProjectAccessCache, type DuoProject } from '@gitlab-org/legacy-common';
import { SelectedProjectStore } from './project_store';

@Injectable(RepositoryProvider, [
  Logger,
  ConfigService,
  GitLabApiService,
  UserService,
  DuoWorkspaceProjectAccessCache,
  SelectedProjectStore,
])
export class DefaultRepositoryProvider implements RepositoryProvider {
  #logger: Logger;

  #configService: ConfigService;

  #api: GitLabApiService;

  #userService: UserService;

  #duoWorkspaceProjectAccessCache: DuoWorkspaceProjectAccessCache;

  #selectedProjectStore: SelectedProjectStore;

  #repositories: RepositoryState[] = [];

  #notify?: NotifyFn<GetRepositoriesResponse>;

  #subscriptions: Disposable[] = [];

  #eventEmitter = diffEmitter(new EventEmitterImpl<GetRepositoriesResponse>());

  constructor(
    logger: Logger,
    configService: ConfigService,
    api: GitLabApiService,
    userService: UserService,
    duoWorkspaceProjectAccessCache: DuoWorkspaceProjectAccessCache,
    selectedProjectStore: SelectedProjectStore,
  ) {
    this.#configService = configService;
    this.#logger = withPrefix(logger, '[RepositoryProvider]');
    this.#api = api;
    this.#userService = userService;
    this.#duoWorkspaceProjectAccessCache = duoWorkspaceProjectAccessCache;
    this.#selectedProjectStore = selectedProjectStore;
  }

  async init(notify: NotifyFn<GetRepositoriesResponse>): Promise<void> {
    this.#notify = notify;

    this.#subscriptions.push(
      this.#duoWorkspaceProjectAccessCache.onDuoProjectCacheUpdate(async () => {
        await this.#recalculate();
        await this.#notifyClient();
      }),

      this.#selectedProjectStore.onSelectedProjectsChange(async () => {
        await this.#recalculate();
        await this.#notifyClient();
      }),
    );

    await this.#recalculate();
    await this.#notifyClient();
  }

  async #notifyClient() {
    if (this.#notify) {
      await this.#notify(this.getRepositories());
    }
    this.#eventEmitter.fire(this.getRepositories());
  }

  getRepositories() {
    return { repositories: this.#repositories };
  }

  async #recalculate(): Promise<undefined> {
    try {
      const repositories: RepositoryState[] = [];

      const workspaceFolders = this.#configService.get('workspaceFolders');

      const workspaceFolderPromises = (workspaceFolders ?? []).map(async (workspaceFolder) => {
        const duoProjects =
          this.#duoWorkspaceProjectAccessCache.getProjectsForWorkspaceFolder(workspaceFolder);

        const repositoryMap = new Map<string, DuoProject[]>();

        duoProjects.forEach((duoProject) => {
          const repositoryPath = new URL(duoProject.uri).pathname.replace('/.git/config', '');
          const existing = repositoryMap.get(repositoryPath) || [];
          existing.push(duoProject);
          repositoryMap.set(repositoryPath, existing);
        });

        const repositoryPromises = Array.from(repositoryMap.entries()).map(
          ([repositoryPath, projects]) =>
            this.#transformToRepositoryState(projects, repositoryPath),
        );

        return Promise.all(repositoryPromises);
      });

      const allWorkspaceRepositories = await Promise.all(workspaceFolderPromises);
      repositories.push(...allWorkspaceRepositories.flat());

      this.#repositories = repositories;
    } catch (error) {
      this.#logger.error('Failed to recalculate repositories', error);
    }
  }

  #extractRemotes(duoProjects: DuoProject[]): Remote[] {
    const remoteMap = new Map<string, Remote>();

    duoProjects.forEach((duoProject) => {
      if (!remoteMap.has(duoProject.remoteName)) {
        remoteMap.set(duoProject.remoteName, {
          name: duoProject.remoteName,
          urls: [
            {
              url: `https://${duoProject.host}/${duoProject.namespaceWithPath}.git`,
              type: 'both' as const,
            },
          ],
        });
      }
    });

    return Array.from(remoteMap.values());
  }

  #buildProjects(duoProjects: DuoProject[], repository: Repository): ProjectInRepository[] {
    return duoProjects.map((duoProject) => ({
      project: {
        name: duoProject.projectPath,
        namespaceWithPath: duoProject.namespaceWithPath,
        webUrl: `https://${duoProject.host}/${duoProject.namespaceWithPath}`,
      },
      account: {
        id: this.#userService.user?.id ?? 'unknown',
        restId: this.#userService.user?.restId ?? -1,
        username: this.#userService.user?.username ?? 'unknown',
        instanceUrl: this.#api.instanceInfo?.instanceUrl.toString() ?? 'https://gitlab.com',
      },
      pointer: {
        urlEntry: {
          url: `https://${duoProject.host}/${duoProject.namespaceWithPath}.git`,
          type: 'both',
        },
        remote: {
          name: duoProject.remoteName,
          urls: [
            { url: `https://${duoProject.host}/${duoProject.namespaceWithPath}.git`, type: 'both' },
          ],
        },
        repository,
      },
      initializationType: 'detected' as const,
    }));
  }

  #findSelectedProject(
    projects: ProjectInRepository[],
    selectedProjects: SelectedProjectSetting[],
    repositoryPath: string,
  ): ProjectInRepository | undefined {
    // Find a selected project that matches this repository
    const selectedSetting = selectedProjects.find(
      (setting) => setting.repositoryRootPath === repositoryPath,
    );

    if (!selectedSetting) {
      return undefined;
    }

    // Find the matching project in the available projects
    return projects.find(
      (project) =>
        project.project.namespaceWithPath === selectedSetting.namespaceWithPath &&
        project.pointer.remote.name === selectedSetting.remoteName &&
        project.pointer.urlEntry.url === selectedSetting.remoteUrl,
    );
  }

  async #transformToRepositoryState(
    duoProjects: DuoProject[],
    repositoryPath: string,
  ): Promise<RepositoryState> {
    const folderName = repositoryPath.split('/').pop() || '';
    const remotes = this.#extractRemotes(duoProjects);

    const repository: Repository = {
      rootFsPath: repositoryPath,
      folderName,
      remotes,
    };

    const projects = this.#buildProjects(duoProjects, repository);

    if (projects.length === 0) {
      return {
        type: 'none',
        repository,
      };
    }

    // Check for selected projects from the store
    const selectedProjects = await this.#selectedProjectStore.getSelectedProjectSettings();
    const selectedProject = this.#findSelectedProject(projects, selectedProjects, repositoryPath);

    if (selectedProject) {
      return {
        type: 'selected',
        repository,
        projects,
        selectedProject,
      };
    }

    if (projects.length === 1) {
      return {
        type: 'single',
        repository,
        projects,
        selectedProject: projects[0],
      };
    }

    return {
      type: 'multiple',
      repository,
      projects,
    };
  }

  dispose() {
    this.#subscriptions.forEach((disposable) => disposable.dispose());
  }

  onRepositoriesChange = this.#eventEmitter.event;
}
