import {
  ApiReconfiguredData,
  ApiRequest,
  GitLabApiService,
  SimpleApiClient,
} from '@gitlab-org/core';
import { Cable } from '@anycable/core';
import { Injectable } from '@gitlab/needle';
import { Disposable } from '@gitlab-org/disposable';
import { Operation } from '@gitlab-org/resiliency';
import { GitLabApiClient } from './api';

@Injectable(GitLabApiService, [GitLabApiClient])
export class ProxyGitLabApiService implements GitLabApiService {
  #client: GitLabApiClient;

  constructor(client: GitLabApiClient) {
    this.#client = client;
  }

  fetchFromApi<TReturnType>(request: ApiRequest<TReturnType>): Promise<TReturnType> {
    return this.#client.fetchFromApi(request);
  }

  fetchFromApiRaw(request: ApiRequest<unknown>): Promise<Response> {
    return this.#client.fetchFromApiRaw(request);
  }

  fetchOperation<TReturnType>(request: ApiRequest<TReturnType>): Operation<TReturnType> {
    return this.#client.fetchOperation(request);
  }

  connectToCable(): Promise<Cable> {
    return this.#client.connectToCable();
  }

  onApiReconfigured(listener: (data: ApiReconfiguredData) => void): Disposable {
    return this.#client.onApiReconfigured(listener);
  }

  getSimpleClient(baseUrl: URL | string, token: string): SimpleApiClient {
    return this.#client.getSimpleClient(baseUrl, token);
  }

  get instanceInfo() {
    return this.#client.instanceInfo;
  }

  get tokenInfo() {
    return this.#client.tokenInfo;
  }
}
