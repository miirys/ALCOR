import { Injectable } from '@gitlab/needle';
import { Controller, endpoint, EndpointProvider } from '@gitlab-org/rpc-endpoint';
import { Logger, withPrefix } from '@gitlab-org/logging';
import { InferResponse } from '@gitlab-org/rpc';
import { GetRepositoriesRequest, RepositoryProvider } from '@gitlab-org/core';

@Injectable(EndpointProvider, [RepositoryProvider, Logger])
export class RepositoryController extends Controller {
  #repositoryProvider: RepositoryProvider;

  #logger: Logger;

  constructor(repositoryProvider: RepositoryProvider, logger: Logger) {
    super();
    this.#repositoryProvider = repositoryProvider;
    this.#logger = withPrefix(logger, '[RepositoryController]');
  }

  @endpoint(GetRepositoriesRequest)
  getRepositories(): InferResponse<typeof GetRepositoriesRequest> {
    this.#logger.debug('Get repositories requested');
    const response = this.#repositoryProvider.getRepositories();
    this.#logger.debug(`Returning ${response.repositories.length} repositories`);
    return response;
  }
}
