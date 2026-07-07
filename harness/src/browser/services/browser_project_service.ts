import { Injectable } from '@gitlab/needle';
import { ApiRequest, GitLabApiService, ProjectResponse } from '@gitlab-org/core';
import { Logger } from '@gitlab-org/logging';
import { ConfigService } from '@gitlab-org/config';
import { Project, ProjectService } from '@gitlab-org/legacy-common';

@Injectable(ProjectService, [ConfigService, GitLabApiService, Logger])
export class BrowserProjectService implements ProjectService {
  readonly #configService: ConfigService;

  readonly #gitlabApiService: GitLabApiService;

  readonly #logger: Logger;

  #project: Project | undefined;

  constructor(configService: ConfigService, gitlabApiService: GitLabApiService, logger: Logger) {
    this.#configService = configService;
    this.#gitlabApiService = gitlabApiService;
    this.#logger = logger;
  }

  async getProjectByFileURI(): Promise<Project | undefined> {
    if (this.#project) {
      return this.#project;
    }

    // This property is useful in the Web IDE because this editor can only open one project at a time
    const projectPath = this.#configService.get('webIdeProjectPath');

    if (!projectPath) {
      this.#logger.error(
        "Can't obtain project information in the web because 'webIdeProjectPath' client configuration was not provided.",
      );
      return undefined;
    }

    const projectRequest: ApiRequest<ProjectResponse> = {
      type: 'rest',
      path: `/api/v4/projects/${encodeURIComponent(projectPath)}`,
      method: 'GET',
    };

    try {
      const projectResponse = await this.#gitlabApiService.fetchFromApi(projectRequest);

      this.#project = {
        id: projectResponse.id,
        namespaceWithPath: projectResponse.path_with_namespace,
        uri: projectResponse.web_url,
      };

      return this.#project;
    } catch (e) {
      this.#logger.error(`Error when fetching project info`, e);
      return undefined;
    }
  }
}
