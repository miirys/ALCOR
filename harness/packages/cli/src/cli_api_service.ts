import { Cable } from '@anycable/core';
import {
  type ApiReconfiguredData,
  type ApiRequest,
  checkToken,
  DefaultSimpleApiClient,
  EventEmitterImpl,
  getLanguageServerVersion,
  GitLabApiService,
  type InstanceInfo,
  SimpleApiClient,
  TokenCheckResponse,
  type TokenInfo,
  versionRequest,
} from '@gitlab-org/core';
import { Operation } from '@gitlab-org/resiliency';
import { Injectable } from '@gitlab/needle';
import { Logger, withPrefix } from '@gitlab-org/logging';
import { LsFetch } from '@gitlab-org/fetch';
import { ConfigService } from '@gitlab-org/config';
import { err, ok, Result } from 'neverthrow';
import { isGlab } from '@gitlab-org/tui';
import {
  CredentialProvider,
  formatCredentialSource,
  type CredentialSource,
} from './utils/credential_provider';
import { DUO_CLI_APP_NAME } from './cli_constants';
import { ParsedCliInput } from './parse';

function credentialHint(source: CredentialSource): string {
  switch (source.type) {
    case 'glab':
      return `Run 'glab auth status' to validate glab is authenticated correctly.`;
    case 'config-file':
      return `Run 'duo config edit' to update your token.`;
    case 'env-or-flag':
      return `The token was provided via GITLAB_TOKEN environment variable or --gitlab-auth-token flag.`;
    case 'none':
      return isGlab() ? `Run 'glab auth login' to authenticate.` : '';
    default: {
      const exhaustiveCheck: never = source;
      throw new Error(`Unknown credential source type: ${String(exhaustiveCheck)}`);
    }
  }
}

interface Initializable {
  initialize(): Promise<Result<void, Error>>;
}

export function isInitializableApiService(
  apiService: GitLabApiService,
): apiService is GitLabApiService & Initializable {
  return apiService && 'initialize' in apiService && typeof apiService.initialize === 'function';
}

@Injectable(GitLabApiService, [CredentialProvider, Logger, LsFetch, ConfigService, ParsedCliInput])
export class CliApiService implements GitLabApiService, Initializable {
  #client?: SimpleApiClient;

  #logger: Logger;

  #lsFetch: LsFetch;

  #credentialProvider: CredentialProvider;

  #baseUrl: string = '';

  #token: string = '';

  #credentialSource: CredentialSource | undefined;

  #eventEmitter = new EventEmitterImpl<ApiReconfiguredData>();

  #instanceInfo?: InstanceInfo;

  #tokenInfo?: TokenInfo;

  #skipTokenCheck: boolean;

  constructor(
    credentialProvider: CredentialProvider,
    logger: Logger,
    lsFetch: LsFetch,
    configService: ConfigService,
    cliInput: ParsedCliInput,
  ) {
    this.#credentialProvider = credentialProvider;
    this.#logger = withPrefix(logger, '[CliApiService]');
    this.#lsFetch = lsFetch;
    this.#skipTokenCheck = cliInput.skipTokenCheck;

    configService.onConfigChange(() => {
      lsFetch.updateAgentOptions({
        ignoreCertificateErrors: configService.get('ignoreCertificateErrors') ?? false,
        ...(configService.get('httpAgentOptions') ?? {}),
      });
    });
  }

  async initialize(): Promise<Result<void, Error>> {
    this.#logger.debug('Starting API initialization');

    await this.#refreshClient();

    let tokenCheckResult: TokenCheckResponse;
    if (this.#skipTokenCheck) {
      this.#logger.info('Skipping token check (--skip-token-check)');
      tokenCheckResult = {
        valid: true,
        tokenInfo: { scopes: ['check-skipped'], type: 'pat', token: this.#token },
      };
    } else {
      try {
        tokenCheckResult = await checkToken(this.#requireClient(), this.#token);
      } catch {
        const errorMessage = 'Failed to check token validity';
        this.#eventEmitter.fire({
          isInValidState: false,
          validationMessage: errorMessage,
        });
        return err(new Error(errorMessage));
      }

      if (!tokenCheckResult.valid) {
        const sourceLabel = this.#credentialSource
          ? formatCredentialSource(this.#credentialSource).long
          : 'unknown';
        const hint = this.#credentialSource ? credentialHint(this.#credentialSource) : '';
        const validationMessage = `${tokenCheckResult.message} Reason: ${tokenCheckResult.reason}\nCredentials source: ${sourceLabel}\n${hint}`;
        this.#eventEmitter.fire({ isInValidState: false, validationMessage });
        return err(new Error(validationMessage));
      }
    }

    let instanceVersion: string;
    try {
      const versionResponse = await this.#requireClient().fetchFromApi(versionRequest);
      instanceVersion = versionResponse.version;
    } catch {
      const errorMessage = 'Failed to fetch GitLab instance version';
      this.#eventEmitter.fire({
        isInValidState: false,
        validationMessage: errorMessage,
      });
      return err(new Error(errorMessage));
    }

    const instanceInfo: InstanceInfo = {
      instanceVersion,
      instanceUrl: new URL(this.#baseUrl),
    };
    this.#instanceInfo = instanceInfo;
    this.#tokenInfo = tokenCheckResult.tokenInfo;

    this.#eventEmitter.fire({
      isInValidState: true,
      instanceInfo,
      tokenInfo: tokenCheckResult.tokenInfo,
    });

    this.#logger.debug('API initialization complete, onApiReconfigured event fired');
    return ok(undefined);
  }

  get instanceInfo() {
    return this.#instanceInfo;
  }

  get tokenInfo() {
    return this.#tokenInfo;
  }

  async fetchFromApi<TReturnType>(request: ApiRequest<TReturnType>): Promise<TReturnType> {
    await this.#refreshClientIfNeeded();
    return this.#requireClient().fetchFromApi(request);
  }

  async fetchFromApiRaw(request: ApiRequest<unknown>): Promise<Response> {
    await this.#refreshClientIfNeeded();
    return this.#requireClient().fetchFromApiRaw(request);
  }

  fetchOperation<TReturnType>(request: ApiRequest<TReturnType>): Operation<TReturnType> {
    // Operations are long-lived; refresh before starting
    return async (signal: AbortSignal) => {
      await this.#refreshClientIfNeeded();
      return this.#requireClient().fetchOperation(request)(signal);
    };
  }

  connectToCable(): Promise<Cable> {
    throw new Error('Method not implemented.');
  }

  onApiReconfigured = this.#eventEmitter.event;

  getSimpleClient(): SimpleApiClient {
    return this.#requireClient();
  }

  #requireClient(): SimpleApiClient {
    if (!this.#client) {
      throw new Error('CliApiService not initialized. Call initialize() first.');
    }
    return this.#client;
  }

  async #refreshClient(): Promise<void> {
    const credentials = await this.#credentialProvider.getCredentials();
    this.#token = credentials.token;
    this.#baseUrl = credentials.baseUrl;
    this.#credentialSource = credentials.source;

    this.#client = new DefaultSimpleApiClient(
      this.#logger,
      this.#lsFetch,
      { name: DUO_CLI_APP_NAME, version: getLanguageServerVersion() },
      this.#baseUrl,
      this.#token,
    );
  }

  async #refreshClientIfNeeded(): Promise<void> {
    const credentials = await this.#credentialProvider.getCredentials();
    const tokenChanged = credentials.token !== this.#token;
    const credentialsChanged =
      tokenChanged ||
      credentials.baseUrl !== this.#baseUrl ||
      credentials.source.type !== this.#credentialSource?.type;

    if (credentialsChanged) {
      this.#logger.debug('Credentials changed, refreshing API client');
      await this.#refreshClient();
      if (tokenChanged) {
        this.#fireReconfiguredWithCurrentToken();
      }
    }
  }

  /**
   * Propagate a credential change (e.g. a rotated OAuth access token) to
   * consumers of `tokenInfo` and `onApiReconfigured`.
   */
  #fireReconfiguredWithCurrentToken(): void {
    if (this.#instanceInfo && this.#tokenInfo) {
      this.#tokenInfo = { ...this.#tokenInfo, token: this.#token };
      this.#eventEmitter.fire({
        isInValidState: true,
        instanceInfo: this.#instanceInfo,
        tokenInfo: this.#tokenInfo,
      });
      this.#logger.debug('Credentials refreshed, onApiReconfigured event fired');
    }
  }
}
