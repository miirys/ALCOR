import { CancellationToken } from 'vscode-languageserver-protocol';
import { Cable as ActionCableCable } from '@anycable/core';
import { Injectable, createInterfaceId } from '@gitlab/needle';
import { Operation } from '@gitlab-org/resiliency';
import {
  ApiReconfiguredData,
  ApiRequest,
  checkToken as checkTokenUtil,
  DefaultSimpleApiClient,
  Event,
  EventEmitterImpl,
  GITLAB_API_BASE_URL,
  handleFetchError,
  ifVersionGte,
  InstanceInfo,
  PostRequest,
  SimpleApiClient,
  type TokenCheckResponse,
  TokenInfo,
  versionRequest,
} from '@gitlab-org/core';
import {
  LsFetch,
  InvalidInstanceVersionError,
  toIsomorphicWsOptions,
  getDroppedOptionsWarnings,
} from '@gitlab-org/fetch';
import { Logger } from '@gitlab-org/logging';
import { ConfigService, ClientInfo } from '@gitlab-org/config';
import { friendlyTokenHashOnlyForLogging } from './utils/friendly_hash';
import { ICodeSuggestionModel } from './tracking/code_suggestions/code_suggestions_tracking_types';
import { log } from './log';
import { AdditionalContext, SuggestionOptionText } from './api_types';
import { connectToCable } from './action_cable';
import { toAbortSignal } from './utils/cancellation_token_utils';

/**
 * @deprecated This interface and implementation are being phased out in favor of the new GitLabApiService from the `@gitlab-org/core` package instead.
 *
 * Reasons for deprecation:
 * 1. Better separation of concerns as we move away from monolithic clients and services
 * 2. Support for declare dependencies on the core api service from packages and plugins
 * 3. Improved maintainability and testability as we move towards a more modular codebase
 *
 * Migration guide:
 * 1. Import GitLabApiService from '@gitlab-org/core'
 * 2. Use dependency injection to get an instance
 * 3. Use the new service methods for API interactions
 *
 * Example usage:
 * ```typescript
 * import { GitLabApiService } from '@gitlab-org/core';
 *
 * @Injectable(MyService, [GitLabApiService])
 * class MyService {
 *   #apiService: GitLabApiService;
 *
 *   constructor(apiService: GitLabApiService) {
 *     this.#apiService = apiService;
 *   }
 * }
 * ```
 */
export interface GitLabApiClient {
  checkToken(
    baseURL: URL | string | undefined,
    token: string | undefined,
    tokenType?: 'pat' | 'oauth',
  ): Promise<TokenCheckResponse>;
  getCodeSuggestions(
    request: CodeSuggestionRequest,
    cancellationToken?: CancellationToken,
  ): Promise<CodeSuggestionResponse | undefined>;
  getStreamingCodeSuggestions(
    request: CodeSuggestionRequest,
    cancellationToken: CancellationToken,
  ):
    | AsyncGenerator<
        {
          chunk: string;
          serverSentEvents: boolean;
        },
        void,
        void
      >
    | undefined;
  fetchFromApi<TReturnType>(request: ApiRequest<TReturnType>): Promise<TReturnType>;
  fetchFromApiRaw(request: ApiRequest<unknown>): Promise<Response>;
  fetchOperation<TReturnType>(request: ApiRequest<TReturnType>): Operation<TReturnType>;
  connectToCable(): Promise<ActionCableCable>;
  onApiReconfigured: Event<ApiReconfiguredData>;
  getSimpleClient(baseUrl: URL | string, token: string): SimpleApiClient;
  readonly instanceInfo?: InstanceInfo;
  readonly tokenInfo?: TokenInfo;
  readonly isInValidState: boolean;
}

export const GitLabApiClient = createInterfaceId<GitLabApiClient>('GitLabApiClient');

export type GenerationType = 'comment' | 'small_file' | 'empty_function' | undefined;

export interface CodeSuggestionRequest {
  prompt_version: number;
  project_path: string;
  model_provider?: string;
  project_id: number;
  current_file: CodeSuggestionRequestCurrentFile;
  intent?: 'completion' | 'generation';
  stream?: boolean;
  /** how many suggestion options should the API return */
  choices_count?: number;
  /** additional context to provide to the model */
  context?: AdditionalContext[];
  /* A user's instructions for code suggestions. */
  user_instruction?: string;
  /* The backend can add additional prompt info based on the type of event */
  generation_type?: GenerationType;
}

export interface CodeSuggestionRequestCurrentFile {
  file_name: string;
  content_above_cursor: string;
  content_below_cursor: string;
}

export interface CodeSuggestionResponse {
  choices?: SuggestionOptionText[];
  model?: ICodeSuggestionModel;
  status: number;
  error?: string;
  isDirectConnection?: boolean;
}

export interface SuggestionOptionStream {
  uniqueTrackingId: string;
  /** the streamId represents the beginning of a stream * */
  streamId: string;
}

export type SuggestionOption = SuggestionOptionText | SuggestionOptionStream;

@Injectable(GitLabApiClient, [Logger, LsFetch, ConfigService])
export class GitLabAPI implements GitLabApiClient {
  #logger: Logger;

  #token: string | undefined;

  #baseURL: URL;

  #clientInfo?: ClientInfo;

  #lsFetch: LsFetch;

  #eventEmitter = new EventEmitterImpl<ApiReconfiguredData>();

  #configService: ConfigService;

  #instanceInfo?: InstanceInfo;

  #isInValidState = false;

  #tokenInfo?: TokenInfo;

  getSimpleClient(baseUrl: URL | string, token: string): SimpleApiClient {
    return new DefaultSimpleApiClient(log, this.#lsFetch, this.#clientInfo, baseUrl, token);
  }

  constructor(logger: Logger, lsFetch: LsFetch, configService: ConfigService) {
    this.#logger = logger;
    this.#baseURL = new URL(GITLAB_API_BASE_URL);
    this.#lsFetch = lsFetch;
    this.#configService = configService;
    this.#configService.onConfigChange(async (config, signal) => {
      this.#clientInfo = configService.get('clientInfo');
      this.#lsFetch.updateAgentOptions({
        ignoreCertificateErrors: this.#configService.get('ignoreCertificateErrors') ?? false,
        ...(this.#configService.get('httpAgentOptions') ?? {}),
      });
      await this.configureApi(
        {
          baseUrl: config.baseUrl ? new URL(config.baseUrl) : config.baseUrl,
          token: config.token || undefined, // treat falsy '' as undefined
        },
        signal,
      );
    });
  }

  onApiReconfigured = this.#eventEmitter.event;

  async configureApi(
    {
      token,
      baseUrl = new URL(GITLAB_API_BASE_URL),
    }: {
      token?: string;
      baseUrl?: URL | string;
    },
    signal: AbortSignal,
  ) {
    const credentialsToLog = `${baseUrl} - ${token ? friendlyTokenHashOnlyForLogging(token) : 'N/A'}`;
    this.#logger.debug(
      `[auth]: Checking if API client is already configured for ${credentialsToLog}`,
    );
    if (this.#token === token && this.#baseURL.toString() === baseUrl.toString()) {
      this.#logger.debug('[auth] The credentials are unchanged, no API configuration is needed');
      return;
    }
    this.#logger.debug(
      `[auth]: The credentials changed, configuring API Client for ${credentialsToLog}`,
    );

    const tokenType = this.#configService.get('tokenType');
    const tokenCheckResult = await this.checkToken(baseUrl, token, tokenType);
    if (signal.aborted) {
      this.#logger.debug(
        `[auth]: a new configuration came in after token check, aborting this configureApi process`,
      );
      return;
    }

    if (!tokenCheckResult.valid) {
      this.#isInValidState = false;
      this.#token = token;
      this.#baseURL = new URL(baseUrl);
      this.#configService.set('token', undefined);

      const validationMessage = `Token is invalid. ${tokenCheckResult.message}. Reason: ${tokenCheckResult.reason}`;
      this.#logger.warn(validationMessage);
      this.#eventEmitter.fire({ isInValidState: false, validationMessage });
      return;
    }

    let instanceVersion: string;
    try {
      instanceVersion = await this.#getGitLabInstanceVersion(new URL(baseUrl), token);
    } catch (error) {
      if (signal.aborted) {
        this.#logger.debug(
          `[auth]: a new configuration came during failed instance version check, aborting this configureApi process`,
        );
        return;
      }
      this.#logger.error(
        '[auth]: Failed to fetch GitLab instance version after token check',
        error,
      );

      this.#isInValidState = false;
      this.#token = token;
      this.#baseURL = new URL(baseUrl);
      this.#configService.set('token', undefined);
      this.#eventEmitter.fire({
        isInValidState: false,
        validationMessage: 'Failed to fetch GitLab instance version',
      });
      return;
    }
    if (signal.aborted) {
      this.#logger.debug(
        `[auth]: a new configuration came in after successful instance version check, aborting this configureApi process`,
      );
      return;
    }

    // IMPORTANT: We have to check if another function already runs the check (with signal.aborted) before we can mutate the state
    // See also https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/-/merge_requests/2145
    this.#token = token;
    this.#baseURL = new URL(baseUrl);
    this.#isInValidState = true;

    const instanceInfo = {
      instanceVersion,
      instanceUrl: this.#baseURL,
    };
    this.#instanceInfo = instanceInfo;
    this.#tokenInfo = tokenCheckResult.tokenInfo;

    this.#eventEmitter.fire({
      isInValidState: true,
      instanceInfo,
      tokenInfo: tokenCheckResult.tokenInfo,
    });

    this.#logger.info(`[auth]: Successfully reconfigured the API Client for ${credentialsToLog}`);
  }

  get instanceInfo() {
    return this.#instanceInfo;
  }

  get isInValidState() {
    return this.#isInValidState;
  }

  get tokenInfo() {
    return this.#tokenInfo;
  }

  async checkToken(
    baseURL: URL | string = this.#baseURL,
    token: string = '',
    tokenType?: 'pat' | 'oauth',
  ): Promise<TokenCheckResponse> {
    return checkTokenUtil(this.getSimpleClient(baseURL, token), token, tokenType);
  }

  async getCodeSuggestions(
    codeSuggestionRequest: CodeSuggestionRequest,
    cancellationToken?: CancellationToken,
  ): Promise<CodeSuggestionResponse | undefined> {
    if (!this.#token) {
      throw new Error('Token needs to be provided to request Code Suggestions');
    }

    const request: PostRequest<CodeSuggestionResponse> = {
      type: 'rest',
      method: 'POST',
      path: '/api/v4/code_suggestions/completions',
      body: codeSuggestionRequest,
      ...(cancellationToken && {
        signal: toAbortSignal(cancellationToken),
      }),
    };

    const response = await this.getSimpleClient(this.#baseURL, this.#token).fetchFromApi(request);

    return { ...response, status: 200 };
  }

  /**
   * Calls the code suggestions API with the given request,
   * and yields chunks of the stream as strings,
   * as the caller is responsible for aggregating them.
   *
   * We let the server know that this client supports SSE streaming by setting the `X-Supports-Sse-Streaming` header.
   *
   * We use the `X-Streaming-Format` header to determine if the server supports SSE streaming.
   * The caller is responsible for parsing the SSE events.
   */
  async *getStreamingCodeSuggestions(
    codeSuggestionRequest: CodeSuggestionRequest,
    cancellationToken: CancellationToken,
  ):
    | AsyncGenerator<
        {
          chunk: string;
          serverSentEvents: boolean;
        },
        void,
        void
      >
    | undefined {
    if (!this.#token) {
      throw new Error('Token needs to be provided to stream code suggestions');
    }
    const path = '/api/v4/code_suggestions/completions';

    const headers = {
      'X-Supports-Sse-Streaming': 'true',
    };

    const request: PostRequest<Response> = {
      type: 'rest',
      method: 'POST',
      path,
      body: codeSuggestionRequest,
      headers,
    };
    const response = await this.getSimpleClient(this.#baseURL, this.#token).fetchFromApiRaw(
      request,
    );

    if (!response.ok) {
      const requestOnlyForErrorLogging: ApiRequest<unknown> = {
        type: 'rest',
        method: 'POST',
        path,
      };

      await handleFetchError(requestOnlyForErrorLogging, response, 'Code Suggestions streaming');
    }

    const isSse = response.headers.get('X-Streaming-Format') === 'sse';
    for await (const chunk of this.#lsFetch.streamResponse(response, cancellationToken)) {
      yield { chunk, serverSentEvents: isSse };
    }
  }

  async fetchFromApi<TReturnType>(request: ApiRequest<TReturnType>): Promise<TReturnType> {
    if (!this.#token) {
      return Promise.reject(new Error('Token needs to be provided to authorise API request.'));
    }

    if (
      request.supportedSinceInstanceVersion &&
      !(await this.#instanceVersionHigherOrEqualThen(
        request.supportedSinceInstanceVersion.version,
        this.#baseURL,
        this.#token,
      ))
    ) {
      return Promise.reject(
        new InvalidInstanceVersionError(
          `Can't ${request.supportedSinceInstanceVersion.resourceName} until your instance is upgraded to ${request.supportedSinceInstanceVersion.version} or higher.`,
        ),
      );
    }

    return this.getSimpleClient(this.#baseURL, this.#token).fetchFromApi(request);
  }

  async fetchFromApiRaw(request: ApiRequest<unknown>): Promise<Response> {
    if (!this.#token) {
      return Promise.reject(new Error('Token needs to be provided to authorise API request.'));
    }

    if (
      request.supportedSinceInstanceVersion &&
      !(await this.#instanceVersionHigherOrEqualThen(
        request.supportedSinceInstanceVersion.version,
        this.#baseURL,
        this.#token,
      ))
    ) {
      return Promise.reject(
        new InvalidInstanceVersionError(
          `Can't ${request.supportedSinceInstanceVersion.resourceName} until your instance is upgraded to ${request.supportedSinceInstanceVersion.version} or higher.`,
        ),
      );
    }

    return this.getSimpleClient(this.#baseURL, this.#token).fetchFromApiRaw(request);
  }

  fetchOperation: <TReturnType>(
    request: ApiRequest<TReturnType>,
  ) => (signal: AbortSignal) => Promise<TReturnType> = (request) => (signal) =>
    this.fetchFromApi({ ...request, signal });

  async connectToCable(): Promise<ActionCableCable> {
    if (!this.#token) {
      throw new Error('Token is not set up. Cannot connect to cable without a token.');
    }
    const headers = this.#getDefaultHeaders(this.#token);

    const wsOptions = this.#lsFetch.getWebSocketOptions(this.#baseURL);
    if (wsOptions) {
      for (const warning of getDroppedOptionsWarnings(wsOptions)) {
        this.#logger.warn(warning);
      }
    }
    const websocketOptions = {
      headers: {
        ...headers,
        Origin: this.#baseURL.origin,
      },
      ...(wsOptions ? toIsomorphicWsOptions(wsOptions) : {}),
    };

    return connectToCable(this.#baseURL, websocketOptions);
  }

  /** @deprecated Use SimpleApiClient.getDefaultHeaders() */
  #getDefaultHeaders(token: string) {
    return this.getSimpleClient(this.#baseURL, token).getDefaultHeaders();
  }

  async #instanceVersionHigherOrEqualThen(
    version: string,
    baseUrl: URL,
    token: string,
  ): Promise<boolean> {
    let instanceVersion = this.#instanceInfo?.instanceVersion;

    // FIXME: these lines don't make sense, we already have the instance version if the API reconfiguration was successful, and if it wasn't, this should not be called
    if (!instanceVersion || baseUrl !== this.#baseURL) {
      instanceVersion = await this.#getGitLabInstanceVersion(baseUrl, token);
    }

    return ifVersionGte(
      instanceVersion,
      version,
      () => true,
      () => false,
    );
  }

  async #getGitLabInstanceVersion(baseUrl: URL, token?: string): Promise<string> {
    if (!token) {
      return '';
    }

    const { version } = await this.getSimpleClient(baseUrl, token).fetchFromApi(versionRequest);
    return version;
  }
}
