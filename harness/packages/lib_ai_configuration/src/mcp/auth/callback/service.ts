import { okAsync, ResultAsync } from 'neverthrow';
import { Disposable, Implements, Service, ServiceLifetime } from '@gitlab/needle';
import { Logger, withPrefix } from '@gitlab-org/logging';
import { OAuthFactoryError } from '../provider/errors';
import { McpAuthFlowController } from '../flow';
import { CallbackServerOptions, OAuthCallbackServer } from './callback_server';
import { McpAuthCallbackUrlProvider } from './types';

@Service({
  lifetime: ServiceLifetime.Singleton,
  dependencies: [McpAuthFlowController, Logger],
})
@Implements(McpAuthCallbackUrlProvider)
export class AuthCallbackService implements McpAuthCallbackUrlProvider, Disposable {
  #flow: McpAuthFlowController;

  #logger: Logger;

  #server: OAuthCallbackServer | null = null;

  #url: URL | null = null;

  constructor(flow: McpAuthFlowController, logger: Logger) {
    this.#flow = flow;
    this.#logger = withPrefix(logger, '[MCP][AuthCallbackService]');
  }

  getCallbackUrl(): ResultAsync<URL, OAuthFactoryError> {
    if (this.#url) {
      return okAsync(this.#url);
    }

    return ResultAsync.fromPromise(
      OAuthCallbackServer.create(this.#flow, this.#logger, {} as CallbackServerOptions),
      (e) => OAuthFactoryError.callbackServerStartFailed(e),
    )
      .map((callbackServer) => {
        this.#server = callbackServer;
        this.#url = callbackServer.callbackUrl;
        this.#logger.info(`server_started origin=${this.#url.origin}`);
        return callbackServer.callbackUrl;
      })
      .orTee((e) => {
        this.#logger.debug(e.message, e.cause);
      });
  }

  dispose(): void {
    this.#server?.dispose();
  }
}
