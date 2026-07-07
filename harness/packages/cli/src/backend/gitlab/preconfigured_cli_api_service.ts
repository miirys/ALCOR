import { Cable } from '@anycable/core';
import {
  type ApiReconfiguredData,
  type ApiRequest,
  EventEmitterImpl,
  GitLabApiService,
  type InstanceInfo,
  SimpleApiClient,
  type TokenInfo,
} from '@gitlab-org/core';
import { Operation } from '@gitlab-org/resiliency';
import { Injectable } from '@gitlab/needle';
import { Logger, withPrefix } from '@gitlab-org/logging';
import { LsFetch } from '@gitlab-org/fetch';
import { ConfigService } from '@gitlab-org/config';
import { ok, Result } from 'neverthrow';
import { CliApiService } from '../../cli_api_service';
import { ParsedCliInput } from '../../parse';
import { CredentialProvider } from '../../utils/credential_provider';
import { tryBuildWorkflowToken, GitLabParsedOptions } from './gitlab_parsed_options';

interface Initializable {
  initialize(): Promise<Result<void, Error>>;
}

/**
 * Pre-configured API service that uses externally provided token and metadata.
 * This service is used in CI environments where all configuration is provided upfront.
 * This API service does a "fake" initialisation, emitting onApiReconfigured like the
 * standard API service, but without actually doing API requests to verify the token etc
 */
@Injectable(GitLabApiService, [
  Logger,
  GitLabParsedOptions,
  CredentialProvider,
  LsFetch,
  ConfigService,
  ParsedCliInput,
])
export class PreConfiguredCliApiService implements GitLabApiService, Initializable {
  #logger: Logger;

  #eventEmitter = new EventEmitterImpl<ApiReconfiguredData>();

  #opts: GitLabParsedOptions;

  #credentialProvider: CredentialProvider;

  #cliApiService: CliApiService;

  #instanceInfo?: InstanceInfo;

  #tokenInfo?: TokenInfo;

  constructor(
    logger: Logger,
    opts: GitLabParsedOptions,
    credentialProvider: CredentialProvider,
    lsFetch: LsFetch,
    configService: ConfigService,
    cliInput: ParsedCliInput,
  ) {
    this.#logger = withPrefix(logger, '[PreConfiguredCliApiService]');
    this.#opts = opts;
    this.#credentialProvider = credentialProvider;
    this.#cliApiService = new CliApiService(
      credentialProvider,
      logger,
      lsFetch,
      configService,
      cliInput,
    );

    this.#logger.debug(`Pre-configured API service created`);
  }

  async initialize(): Promise<Result<void, Error>> {
    this.#logger.debug('Starting pre-configured API initialization (no API calls)');

    const credentials = await this.#credentialProvider.getCredentials();
    const workflowToken = tryBuildWorkflowToken(this.#opts, credentials);

    if (!workflowToken) {
      throw new Error('Expected workflow token to be present in headless CI mode. This is a bug.');
    }

    const instanceUrl = new URL(workflowToken.gitlab_rails.base_url);
    this.#instanceInfo = {
      instanceVersion: workflowToken.duo_workflow_service.headers['X-Gitlab-Version'] || 'unknown',
      instanceUrl,
    };

    this.#tokenInfo = {
      token: workflowToken.gitlab_rails.token,
      scopes: [],
      type: 'pat',
    };

    // Fire the event immediately to set up WebSocket connection details
    this.#eventEmitter.fire({
      isInValidState: true,
      instanceInfo: this.#instanceInfo,
      tokenInfo: this.#tokenInfo,
    });

    this.#logger.debug('Pre-configured API initialization complete, onApiReconfigured event fired');
    return ok(undefined);
  }

  get instanceInfo() {
    return this.#instanceInfo;
  }

  get tokenInfo() {
    return this.#tokenInfo;
  }

  fetchFromApi<TReturnType>(request: ApiRequest<TReturnType>): Promise<TReturnType> {
    return this.#cliApiService.fetchFromApi(request);
  }

  fetchFromApiRaw(request: ApiRequest<unknown>): Promise<Response> {
    return this.#cliApiService.fetchFromApiRaw(request);
  }

  fetchOperation<TReturnType>(request: ApiRequest<TReturnType>): Operation<TReturnType> {
    return this.#cliApiService.fetchOperation(request);
  }

  connectToCable(): Promise<Cable> {
    return this.#cliApiService.connectToCable();
  }

  onApiReconfigured = this.#eventEmitter.event;

  getSimpleClient(): SimpleApiClient {
    return this.#cliApiService.getSimpleClient();
  }
}
