import { Logger } from '@gitlab-org/logging';
import { ClientError, GraphQLClient } from 'graphql-request';
import { LsFetch } from '@gitlab-org/fetch';
import { handleFetchError } from '../fetch/handle_fetch_error';
import { getLanguageServerVersion } from '../get_language_server_version';
import { getUserAgent } from '../utils/get_user_agent';
import { addQueryParams, ensureEndsWithSlash, ensureRelativePath } from '../utils/url';
import { GraphQLError, NetworkError } from './errors';
import { extractGraphQLOperationLabel } from './graphql_query_identifier_utils';
import {
  ApiRequest,
  GetRequest,
  GraphQLRequest,
  HeadRequest,
  PatchRequest,
  PostRequest,
  PutRequest,
  RestRequest,
  SimpleApiClient,
} from './types';

const getResourceName = (path: string) => path.split('/').pop() || 'unknown resource';

type ClientInfo = { name: string; version?: string };

export class DefaultSimpleApiClient implements SimpleApiClient {
  #logger: Logger;

  #lsFetch: LsFetch;

  #baseUrl: URL;

  #token: string;

  #clientInfo?: ClientInfo;

  constructor(
    logger: Logger,
    lsFetch: LsFetch,
    clientInfo: ClientInfo | undefined,
    baseUrl: URL | string,
    token: string,
  ) {
    this.#logger = logger;
    this.#lsFetch = lsFetch;
    this.#baseUrl = new URL(ensureEndsWithSlash(baseUrl)); // ensures correct paths are resolved for GitLab instances on a custom path, e.g. "https://example.com/gitlab"
    this.#token = token;
    this.#clientInfo = clientInfo;
  }

  getGitlabClientHeaders(clientInfo: ClientInfo | undefined) {
    return {
      'X-Gitlab-Client-Name': clientInfo?.name ?? 'unknown',
      'X-Gitlab-Client-Version': clientInfo?.version ?? 'unknown',
    };
  }

  getDefaultHeaders() {
    return {
      Authorization: `Bearer ${this.#token}`,
      'User-Agent': getUserAgent(this.#clientInfo),
      'X-Gitlab-Language-Server-Version': getLanguageServerVersion(),
      ...this.getGitlabClientHeaders(this.#clientInfo),
    };
  }

  async fetchFromApiRaw(request: RestRequest<unknown>): Promise<Response> {
    try {
      const unknownRequestMethodError = `Unknown request method "${request.method}", request type "${request.type}"`;
      switch (request.method) {
        case 'GET':
          return await this.#fetchRaw(request);
        case 'POST':
          return await this.#postFetchRaw(request);
        case 'PATCH':
          return await this.#patchFetchRaw(request);
        case 'PUT':
          return await this.#putFetchRaw(request);
        case 'HEAD':
          return await this.#headFetchRaw(request);
        default:
          throw new Error(unknownRequestMethodError);
      }
    } catch (e) {
      throw new NetworkError(request, e);
    }
  }

  async fetchFromApi<TReturnType>(request: ApiRequest<TReturnType>): Promise<TReturnType> {
    if (request.type === 'graphql') {
      return this.#graphqlRequest(request);
    }

    const response = await this.fetchFromApiRaw(request);

    await handleFetchError(request, response, getResourceName(request.path));

    return response.json();
  }

  fetchOperation: <TReturnType>(
    request: ApiRequest<TReturnType>,
  ) => (signal: AbortSignal) => Promise<TReturnType> = (request) => (signal) =>
    this.fetchFromApi({ ...request, signal });

  async #graphqlRequest<T = unknown>(request: GraphQLRequest<T>): Promise<T> {
    const endpoint = new URL('./api/graphql', this.#baseUrl);

    const operationLabel = extractGraphQLOperationLabel(request.query);
    if (operationLabel) {
      this.#logger.debug(`[SimpleApiClient] Making GraphQL request: ${operationLabel}`);
    }

    const graphqlFetch = async (
      input: RequestInfo | URL,
      init?: RequestInit,
    ): Promise<Response> => {
      const url = input instanceof URL ? input.toString() : input;
      return this.#lsFetch.post(url, {
        ...init,
        headers: { ...init?.headers },
        signal: request.signal,
      });
    };

    const client = new GraphQLClient(endpoint.href, {
      fetch: graphqlFetch,
      headers: { ...this.getDefaultHeaders() },
    });

    try {
      return await client.request(request.query, request.variables);
    } catch (error: unknown) {
      if (error instanceof ClientError) {
        throw new GraphQLError(request, error.response);
      }
      throw new NetworkError(request, error);
    }
  }

  async #fetchRaw(request: GetRequest<unknown>): Promise<Response> {
    const resourcePath = ensureRelativePath(request.path);
    const url = new URL(resourcePath, this.#baseUrl);

    addQueryParams(url, request.searchParams ?? {});

    return this.#lsFetch.get(url, {
      headers: { ...this.getDefaultHeaders(), ...request.headers },
      signal: request.signal,
    });
  }

  async #postFetchRaw(request: PostRequest<unknown>): Promise<Response> {
    const resourcePath = ensureRelativePath(request.path);
    const url = new URL(resourcePath, this.#baseUrl);

    const requestParams = {
      headers: {
        'Content-Type': 'application/json',
        ...this.getDefaultHeaders(),
        ...request.headers,
      },
      body: JSON.stringify(request.body),
      signal: request.signal,
    };
    return this.#lsFetch.post(url, requestParams);
  }

  async #patchFetchRaw(request: PatchRequest<unknown>) {
    const resourcePath = ensureRelativePath(request.path);
    const url = new URL(resourcePath, this.#baseUrl);

    return this.#lsFetch.patch(url, {
      headers: {
        'Content-Type': 'application/json',
        ...this.getDefaultHeaders(),
        ...request.headers,
      },
      body: JSON.stringify(request.body),
      signal: request.signal,
    });
  }

  async #putFetchRaw(request: PutRequest<unknown>) {
    const resourcePath = ensureRelativePath(request.path);
    const url = new URL(resourcePath, this.#baseUrl);

    return this.#lsFetch.put(url, {
      headers: {
        'Content-Type': 'application/json',
        ...this.getDefaultHeaders(),
        ...request.headers,
      },
      body: JSON.stringify(request.body),
      signal: request.signal,
    });
  }

  async #headFetchRaw(request: HeadRequest): Promise<Response> {
    const resourcePath = ensureRelativePath(request.path);
    const url = new URL(resourcePath, this.#baseUrl);

    addQueryParams(url, request.searchParams ?? {});

    return this.#lsFetch.head(url, {
      headers: { ...this.getDefaultHeaders(), ...request.headers },
      signal: request.signal,
    });
  }
}
