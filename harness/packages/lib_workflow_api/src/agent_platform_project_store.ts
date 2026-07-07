import {
  UserPersistentStorage,
  SELECTED_AGENT_PLATFORM_PROJECT_STORAGE_KEY,
  SelectedAgentPlatformProjects,
} from '@gitlab-org/persistent-storage';
import { Logger, withPrefix } from '@gitlab-org/logging';
import { createInterfaceId, Injectable } from '@gitlab/needle';
import { diffEmitter, EventEmitterImpl, EventListener } from '@gitlab-org/core';
import { Disposable } from '@gitlab-org/disposable';

export interface AgentPlatformProjectStore {
  setSelectedProject(repositoryPath: string, namespaceWithPath: string): Promise<void>;
  getSelectedProject(repositoryPath: string): Promise<string | null>;
  clearSelectedProject(repositoryPath: string): Promise<void>;
  getAllSelectedProjects(): Promise<SelectedAgentPlatformProjects>;
  onSelectedProjectChange(listener: EventListener<SelectedAgentPlatformProjects>): Disposable;
}

export const AgentPlatformProjectStore = createInterfaceId<AgentPlatformProjectStore>(
  'AgentPlatformProjectStore',
);

@Injectable(AgentPlatformProjectStore, [UserPersistentStorage, Logger])
export class DefaultAgentPlatformProjectStore implements AgentPlatformProjectStore {
  #storage: UserPersistentStorage;

  #logger: Logger;

  #eventEmitter = diffEmitter(new EventEmitterImpl<SelectedAgentPlatformProjects>());

  constructor(storage: UserPersistentStorage, logger: Logger) {
    this.#storage = storage;
    this.#logger = withPrefix(logger, '[AgentPlatformProjectStore]');
  }

  async setSelectedProject(repositoryPath: string, namespaceWithPath: string): Promise<void> {
    try {
      const allProjects = await this.getAllSelectedProjects();
      allProjects[repositoryPath] = namespaceWithPath;

      await this.#storage.set(SELECTED_AGENT_PLATFORM_PROJECT_STORAGE_KEY, allProjects);
      this.#eventEmitter.fire(allProjects);

      this.#logger.debug(`Set selected project for ${repositoryPath}: ${namespaceWithPath}`);
    } catch (error) {
      this.#logger.error('Failed to set selected Agentic Chat project', error);
      throw error;
    }
  }

  async getSelectedProject(repositoryPath: string): Promise<string | null> {
    try {
      const allProjects = await this.getAllSelectedProjects();
      return allProjects[repositoryPath] || null;
    } catch (error) {
      this.#logger.error('Failed to get selected Agentic Chat project', error);
      return null;
    }
  }

  async clearSelectedProject(repositoryPath: string): Promise<void> {
    try {
      const allProjects = await this.getAllSelectedProjects();
      delete allProjects[repositoryPath];

      await this.#storage.set(SELECTED_AGENT_PLATFORM_PROJECT_STORAGE_KEY, allProjects);
      this.#eventEmitter.fire(allProjects);

      this.#logger.debug(`Cleared selected project for ${repositoryPath}`);
    } catch (error) {
      this.#logger.error('Failed to clear selected Agentic Chat project', error);
      throw error;
    }
  }

  async getAllSelectedProjects(): Promise<SelectedAgentPlatformProjects> {
    try {
      const projects = await this.#storage.get(SELECTED_AGENT_PLATFORM_PROJECT_STORAGE_KEY);
      return projects || {};
    } catch (error) {
      this.#logger.error('Failed to get all selected projects', error);
      return {};
    }
  }

  onSelectedProjectChange = this.#eventEmitter.event;
}
