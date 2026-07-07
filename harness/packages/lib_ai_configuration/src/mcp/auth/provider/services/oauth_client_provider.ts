// eslint-disable-next-line max-classes-per-file
import { Logger, withPrefix } from '@gitlab-org/logging';

import { OAuthClientProvider } from '@modelcontextprotocol/sdk/client/auth.js';
import {
  OAuthClientMetadata,
  OAuthClientInformation,
  OAuthClientInformationMixed,
  OAuthTokens,
} from '@modelcontextprotocol/sdk/shared/auth.js';
import { WorkflowUrlOpenerService } from '../../../url_opener_service';
import { type StreamableHttpServerConfig, type SseServerConfig } from '../../../config';
import type { McpServerInfo, ServerName } from '../../../types';
import {
  TokenStorage,
  ClientInfoStorage,
  Token,
  ClientInfo,
  createStoredToken,
} from '../../storage';
import { McpAuthFlowController } from '../../flow';

const TOKEN_EXPIRY_SKEW_MS = 30_000; // 30s safety window

class OAuthProviderError extends Error {
  readonly code: string;

  readonly cause: unknown;

  constructor(code: string, message: string, cause?: unknown) {
    super(message);
    this.name = 'OAuthProviderError';
    this.code = code;
    this.cause = cause;
  }
}

export class DefaultOAuthClientProvider implements OAuthClientProvider {
  #name: ServerName;

  #serverConfig: StreamableHttpServerConfig | SseServerConfig;

  #logger: Logger;

  #urlOpenerService: WorkflowUrlOpenerService;

  #tokenStorage: TokenStorage;

  #clientInfoStorage: ClientInfoStorage;

  #authFlowController: McpAuthFlowController;

  #codeVerifier?: string;

  #currentState?: string;

  #redirectUrl: URL;

  constructor(
    serverInfo: McpServerInfo<StreamableHttpServerConfig | SseServerConfig>,
    urlOpenerService: WorkflowUrlOpenerService,
    tokenStorage: TokenStorage,
    clientInfoStorage: ClientInfoStorage,
    authFlowController: McpAuthFlowController,
    logger: Logger,
    redirectUrl?: URL,
  ) {
    this.#name = serverInfo.name;
    this.#serverConfig = serverInfo.config;
    this.#urlOpenerService = urlOpenerService;
    this.#tokenStorage = tokenStorage;
    this.#clientInfoStorage = clientInfoStorage;
    this.#authFlowController = authFlowController;
    this.#logger = withPrefix(logger, `[MCP][OAuth][${this.#name}]`);

    if (!redirectUrl) {
      throw new OAuthProviderError(
        'OAUTH_MISSING_REDIRECT_URL',
        'redirectUrl is required for OAuth flow',
      );
    }
    this.#redirectUrl = redirectUrl;
  }

  get redirectUrl(): URL {
    return this.#redirectUrl;
  }

  get clientMetadata(): OAuthClientMetadata {
    return {
      client_name: `GitLab Language Server - ${this.#name}`,
      redirect_uris: [this.#redirectUrl.toString()],
      scope: this.#serverConfig.oauth2?.scopes?.join(' '),
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: 'none',
    };
  }

  async clientInformation(): Promise<OAuthClientInformation | undefined> {
    // Prefer explicit config
    if (this.#serverConfig.oauth2?.clientId) {
      return {
        client_id: this.#serverConfig.oauth2.clientId,
        client_secret: this.#serverConfig.oauth2.clientSecret,
      };
    }

    // Otherwise look in storage — never throw here, just log + return undefined
    return (await this.#clientInfoStorage.load(this.#name))
      .map<OAuthClientInformation>((x) => ({
        client_id: x.client_id,
        client_secret: x.client_secret,
      }))
      .orTee((e) => {
        if (e.code === 'STORAGE_NOT_FOUND') {
          this.#logger.debug('client_info: none found');
        } else {
          this.#logger.error(`client_info: load_failed code=${e.code}`);
        }
      })
      .unwrapOr(undefined);
  }

  async saveClientInformation(clientInfo: OAuthClientInformationMixed): Promise<void> {
    // Don’t log secrets
    this.#logger.info('client_info: saving');

    const storedClientInfo: ClientInfo = {
      client_id: clientInfo.client_id,
      client_secret: clientInfo.client_secret,
    };

    const res = await this.#clientInfoStorage.store(this.#name, storedClientInfo);
    if (res.isErr()) {
      this.#logger.error(`client_info: save_failed code=${res.error.code}`);
      // SDK expects a thrown Error here
      throw new OAuthProviderError(
        'OAUTH_STORAGE_SAVE_FAILED',
        'Failed to save OAuth client information',
        res.error,
      );
    }
  }

  async tokens(): Promise<OAuthTokens | undefined> {
    return (await this.#tokenStorage.load(this.#name))
      .map<OAuthTokens | undefined>((token) => {
        if (!token.access_token) return undefined;

        const now = Date.now();
        const expired = token.expires_at && now >= token.expires_at - TOKEN_EXPIRY_SKEW_MS;

        return {
          access_token: token.access_token,
          token_type: token.token_type,
          refresh_token: token.refresh_token,
          // eslint-disable-next-line no-nested-ternary
          expires_in: expired
            ? 0
            : token.expires_at
              ? Math.floor((token.expires_at - now) / 1000)
              : undefined,
        } as OAuthTokens;
      })
      .orTee((e) => {
        if (e.code === 'STORAGE_NOT_FOUND') {
          this.#logger.debug('tokens: none found');
        } else {
          this.#logger.error(`tokens: load_failed code=${e.code}`);
        }
      })
      .unwrapOr(undefined);
  }

  async saveTokens(tokens: OAuthTokens): Promise<void> {
    this.#logger.info('tokens: saving');

    const storedToken: Token = createStoredToken(tokens);
    const res = await this.#tokenStorage.store(this.#name, storedToken);
    if (res.isErr()) {
      this.#logger.error(`tokens: save_failed code=${res.error.code}`);
      // SDK expects a thrown Error here
      throw new OAuthProviderError(
        'OAUTH_STORAGE_SAVE_FAILED',
        'Failed to save OAuth tokens',
        res.error,
      );
    }
  }

  async redirectToAuthorization(authorizationUrl: URL): Promise<void> {
    this.#logger.info(`authorize: opening_browser issuer=${authorizationUrl.origin}`);

    // Notify the auth flow controller about the auth URL
    // This allows the dashboard to display the URL to users
    if (this.#currentState) {
      this.#authFlowController.notifyAuthFlowStarted(
        this.#name,
        authorizationUrl.toString(),
        this.#currentState,
      );
    }

    await this.#urlOpenerService.openUrl(authorizationUrl.toString());
  }

  async saveCodeVerifier(codeVerifier: string): Promise<void> {
    this.#codeVerifier = codeVerifier;
  }

  async codeVerifier(): Promise<string> {
    if (!this.#codeVerifier) {
      // SDK explicitly expects a thrown Error here
      throw new OAuthProviderError('OAUTH_MISSING_CODE_VERIFIER', 'No code verifier saved');
    }
    return this.#codeVerifier;
  }

  async state(): Promise<string> {
    const state = this.#authFlowController.startFlow(this.#name);
    this.#currentState = state;
    this.#logger.debug('state: generated');
    return state;
  }
}
