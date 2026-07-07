import { OAuthClientProvider } from '@modelcontextprotocol/sdk/client/auth.js';
import { Logger, withPrefix } from '@gitlab-org/logging';
import { ResultAsync } from 'neverthrow';
import { createInterfaceId, Implements, Service, ServiceLifetime } from '@gitlab/needle';
import { WorkflowUrlOpenerService } from '../../../url_opener_service';
import { McpServerInfo } from '../../../types';
import type { StreamableHttpServerConfig, SseServerConfig } from '../../../config';
import { TokenStorage, ClientInfoStorage } from '../../storage';
import { McpAuthFlowController } from '../../flow';
import { McpAuthCallbackUrlProvider } from '../../callback';
import { OAuthFactoryError } from '../errors';
import { DefaultOAuthClientProvider } from './oauth_client_provider';

export interface OAuthClientProviderFactory {
  createOAuthClientProvider(
    serverInfo: McpServerInfo,
  ): ResultAsync<OAuthClientProvider, OAuthFactoryError>;
}

export const OAuthClientProviderFactory = createInterfaceId<OAuthClientProviderFactory>(
  'OAuthClientProviderFactory',
);

@Service({
  lifetime: ServiceLifetime.Singleton,
  dependencies: [
    McpAuthFlowController,
    WorkflowUrlOpenerService,
    TokenStorage,
    ClientInfoStorage,
    McpAuthCallbackUrlProvider,
    Logger,
  ],
})
@Implements(OAuthClientProviderFactory)
export class DefaultOAuthClientProviderFactory implements OAuthClientProviderFactory {
  #urlOpener: WorkflowUrlOpenerService;

  #tokenStorage: TokenStorage;

  #clientInfoStorage: ClientInfoStorage;

  #authCallbackUrlProvider: McpAuthCallbackUrlProvider;

  #authFlowManager: McpAuthFlowController;

  #logger: Logger;

  #log: Logger;

  constructor(
    authFlowManager: McpAuthFlowController,
    urlOpener: WorkflowUrlOpenerService,
    tokenStorage: TokenStorage,
    clientInfoStorage: ClientInfoStorage,
    authCallbackUrlProvider: McpAuthCallbackUrlProvider,
    logger: Logger,
  ) {
    this.#authFlowManager = authFlowManager;
    this.#urlOpener = urlOpener;
    this.#tokenStorage = tokenStorage;
    this.#clientInfoStorage = clientInfoStorage;
    this.#authCallbackUrlProvider = authCallbackUrlProvider;
    this.#logger = logger;
    this.#log = withPrefix(logger, '[MCP][OAuthFactory]');
  }

  createOAuthClientProvider(
    serverInfo: McpServerInfo<StreamableHttpServerConfig | SseServerConfig>,
  ): ResultAsync<OAuthClientProvider, OAuthFactoryError> {
    return this.#authCallbackUrlProvider
      .getCallbackUrl()
      .map((callbackUrl) => {
        return new DefaultOAuthClientProvider(
          serverInfo,
          this.#urlOpener,
          this.#tokenStorage,
          this.#clientInfoStorage,
          this.#authFlowManager,
          this.#logger,
          callbackUrl,
        );
      })
      .andTee(() => {
        this.#log.debug(`provider: created for=${serverInfo.name}`);
      })
      .orTee((e) => {
        this.#log.error(
          `provider: failed for=${serverInfo.name} code=${e.code} msg=${e.message}`,
          e.cause,
        );
      });
  }
}
