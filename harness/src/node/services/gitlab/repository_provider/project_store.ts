import {
  UserPersistentStorage,
  SelectedProjectSetting,
  SELECTED_PROJECT_IN_REPOSITORY_STORAGE_KEY,
} from '@gitlab-org/persistent-storage';
import { Logger, withPrefix } from '@gitlab-org/logging';
import { createInterfaceId, Injectable } from '@gitlab/needle';
import {
  ProjectInRepository,
  diffEmitter,
  EventEmitterImpl,
  EventListener,
} from '@gitlab-org/core';
import { Disposable } from '@gitlab-org/disposable';

export const convertProjectToSetting = ({
  account,
  project,
  pointer,
}: ProjectInRepository): SelectedProjectSetting => ({
  accountId: account.id,
  namespaceWithPath: project.namespaceWithPath,
  remoteName: pointer.remote.name,
  remoteUrl: pointer.urlEntry.url,
  repositoryRootPath: pointer.repository.rootFsPath,
});

export interface SelectedProjectStore {
  addSelectedProject(selectedProject: ProjectInRepository): Promise<void>;
  clearSelectedProjects(rootFsPath: string): Promise<void>;
  getSelectedProjectSettings(): Promise<SelectedProjectSetting[]>;
  onSelectedProjectsChange(listener: EventListener<SelectedProjectSetting[]>): Disposable;
}

export const SelectedProjectStore = createInterfaceId<SelectedProjectStore>('SelectedProjectStore');

@Injectable(SelectedProjectStore, [UserPersistentStorage, Logger])
export class DefaultSelectedProjectStore implements SelectedProjectStore {
  #storage: UserPersistentStorage;

  #logger: Logger;

  #eventEmitter = diffEmitter(new EventEmitterImpl<SelectedProjectSetting[]>());

  constructor(storage: UserPersistentStorage, logger: Logger) {
    this.#storage = storage;
    this.#logger = withPrefix(logger, '[SelectedProjectStore]');
  }

  async addSelectedProject(selectedProject: ProjectInRepository): Promise<void> {
    try {
      const selectedProjectSetting = convertProjectToSetting(selectedProject);
      const currentProjects = await this.getSelectedProjectSettings();

      // Check if project already exists
      const exists = currentProjects.some(
        (p) =>
          p.repositoryRootPath === selectedProjectSetting.repositoryRootPath &&
          p.remoteUrl === selectedProjectSetting.remoteUrl,
      );

      if (!exists) {
        const updatedProjects = [...currentProjects, selectedProjectSetting];
        await this.#storage.set('selectedProjectInRepository', updatedProjects);
        this.#eventEmitter.fire(updatedProjects);

        this.#logger.debug(`Added selected project ${selectedProjectSetting.namespaceWithPath}`);
      }
    } catch (error) {
      this.#logger.error('Failed to add selected project', error);
      throw error;
    }
  }

  async clearSelectedProjects(rootFsPath: string): Promise<void> {
    try {
      const currentProjects = await this.getSelectedProjectSettings();
      const filteredProjects = currentProjects.filter((p) => p.repositoryRootPath !== rootFsPath);

      if (filteredProjects.length !== currentProjects.length) {
        await this.#storage.set('selectedProjectInRepository', filteredProjects);
        this.#eventEmitter.fire(filteredProjects);

        this.#logger.debug(`Cleared selected projects for repository ${rootFsPath}`);
      }
    } catch (error) {
      this.#logger.error('Failed to clear selected projects', error);
      throw error;
    }
  }

  async getSelectedProjectSettings(): Promise<SelectedProjectSetting[]> {
    try {
      const projects = await this.#storage.get(SELECTED_PROJECT_IN_REPOSITORY_STORAGE_KEY);
      return projects || [];
    } catch (error) {
      this.#logger.error('Failed to get selected projects', error);
      return [];
    }
  }

  onSelectedProjectsChange = this.#eventEmitter.event;
}
