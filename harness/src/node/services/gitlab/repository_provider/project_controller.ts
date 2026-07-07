import { Injectable } from '@gitlab/needle';
import { Controller, endpoint, EndpointProvider } from '@gitlab-org/rpc-endpoint';
import { Logger, withPrefix } from '@gitlab-org/logging';
import { InferResponse } from '@gitlab-org/rpc';
import { SelectProjectRequest, ClearProjectRequest, ProjectInRepository } from '@gitlab-org/core';
import { SelectedProjectStore } from './project_store';

@Injectable(EndpointProvider, [SelectedProjectStore, Logger])
export class PersistedProjectController extends Controller {
  #selectedProjectStore: SelectedProjectStore;

  #logger: Logger;

  constructor(selectedProjectStore: SelectedProjectStore, logger: Logger) {
    super();
    this.#selectedProjectStore = selectedProjectStore;
    this.#logger = withPrefix(logger, '[ProjectController]');
  }

  @endpoint(SelectProjectRequest)
  async selectProject(
    selectedProject: ProjectInRepository,
  ): Promise<InferResponse<typeof SelectProjectRequest>> {
    this.#logger.debug(
      `Select project ${selectedProject.project.namespaceWithPath} for repository requested`,
    );

    try {
      await this.#selectedProjectStore.addSelectedProject(selectedProject);

      this.#logger.debug(
        `Project ${selectedProject.project.namespaceWithPath} selected successfully`,
      );
    } catch (error) {
      this.#logger.error('Failed to select project', error);
      throw error;
    }
  }

  @endpoint(ClearProjectRequest)
  async clearProject(params: {
    rootFsPath: string;
  }): Promise<InferResponse<typeof ClearProjectRequest>> {
    this.#logger.debug(`Clear project requested for repository ${params.rootFsPath}`);

    try {
      await this.#selectedProjectStore.clearSelectedProjects(params.rootFsPath);

      this.#logger.debug(`Projects cleared successfully for repository at ${params.rootFsPath}`);
    } catch (error) {
      this.#logger.error('Failed to clear projects', error);
      throw error;
    }
  }
}
