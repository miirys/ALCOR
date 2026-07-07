import { createInterfaceId, Injectable } from '@gitlab/needle';
import { ApiReconfiguredData, GitLabApiService, ifVersionGte } from '@gitlab-org/core';
import { CompositeDisposable, Disposable } from '@gitlab-org/disposable';
import { Logger } from '@gitlab-org/logging';
import { GraphQLOperation } from './types';

export interface GraphQLService {
  execute<Data, Variables>(
    operation: GraphQLOperation<Data>,
    variables: Variables,
    signal?: AbortSignal,
  ): Promise<Data>;
}

export const GraphQLService = createInterfaceId<GraphQLService>('GraphQLService');

@Injectable(GraphQLService, [GitLabApiService, Logger])
export class DefaultGraphQLService implements Disposable, GraphQLService {
  #disposables = new CompositeDisposable();

  #api: GitLabApiService;

  #instanceVersion: string | undefined;

  #logger: Logger;

  constructor(api: GitLabApiService, logger: Logger) {
    this.#api = api;
    this.#instanceVersion = this.#api.instanceInfo?.instanceVersion;
    this.#logger = logger;
    this.#disposables.add(
      this.#api.onApiReconfigured((data: ApiReconfiguredData) => {
        if (data.isInValidState) {
          this.#instanceVersion = data.instanceInfo.instanceVersion;
        }
      }),
    );
  }

  async execute<Data, Variables>(
    { supportedSinceInstanceVersion, fallback, query }: GraphQLOperation<Data>,
    variables: Variables = {} as Variables,
    signal?: AbortSignal,
  ): Promise<Data> {
    if (!this.#laterVersion(supportedSinceInstanceVersion)) {
      this.#logger.debug(
        `GitLab ${supportedSinceInstanceVersion} is required to use this operation falling back to default behaviour.`,
      );
      return fallback({ unsupported: 'future_field' });
    }

    try {
      return await this.#api.fetchFromApi<Data>({
        type: 'graphql',
        query,
        variables: variables ?? {},
        signal,
      });
    } catch (err) {
      return fallback({ err });
    }
  }

  dispose(): void {
    this.#disposables.dispose();
  }

  #laterVersion(supportedSinceInstanceVersion: string | undefined): boolean {
    if (supportedSinceInstanceVersion) {
      return ifVersionGte(
        this.#instanceVersion,
        supportedSinceInstanceVersion,
        () => true,
        () => false,
      );
    }

    return false;
  }
}
