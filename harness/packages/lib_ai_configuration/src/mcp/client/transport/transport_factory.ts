import { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';

import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';

import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { ResultAsync, errAsync, okAsync } from 'neverthrow';
import { LsFetch } from '@gitlab-org/fetch';
import { Service, ServiceLifetime } from '@gitlab/needle';
import { OAuthClientProviderFactory } from '../../auth';
import { McpServerInfo } from '../../types';
import { StdioServerConfig } from '../../config';
import { McpStdioCommandTransformer } from '../../transport/stdio_command_transformer';
import { TransportError } from './error';

@Service({
  dependencies: [OAuthClientProviderFactory, LsFetch, McpStdioCommandTransformer],
  lifetime: ServiceLifetime.Singleton,
})
export class TransportFactory {
  #authProviderFactory: OAuthClientProviderFactory;

  #lsFetch: LsFetch;

  #stdioTransformer: McpStdioCommandTransformer;

  constructor(
    authProviderFactory: OAuthClientProviderFactory,
    lsFetch: LsFetch,
    stdioTransformer: McpStdioCommandTransformer,
  ) {
    this.#authProviderFactory = authProviderFactory;
    this.#lsFetch = lsFetch;
    this.#stdioTransformer = stdioTransformer;
  }

  /**
   * Creates a transport for the given server.
   * @param serverInfo - The server configuration.
   * @param workspacePath - Absolute path to the workspace root.
   *   TODO: Move this to a provider for DI instead of passing as a string argument.
   */
  createTransport(
    serverInfo: McpServerInfo,
    workspacePath: string,
  ): ResultAsync<Transport, TransportError> {
    switch (serverInfo.config.type) {
      case 'stdio': {
        if (!serverInfo.config.command) {
          return errAsync(
            TransportError.invalidConfig(serverInfo.name, 'Missing `command` for stdio transport'),
          );
        }

        const { config } = serverInfo as McpServerInfo<StdioServerConfig>;
        const args = config.args ?? [];

        return ResultAsync.fromPromise(
          this.#stdioTransformer.transform(
            serverInfo.name,
            { command: config.command, args, env: config.env },
            workspacePath,
            config.sandbox,
          ),
          (e) => TransportError.creationFailed(serverInfo.name, 'stdio', e),
        ).map(
          (params) =>
            new StdioClientTransport({
              command: params.command,
              args: params.args,
              env: params.env,
              cwd: config.cwd ?? workspacePath,
              stderr: 'pipe',
            }),
        );
      }

      case 'sse': {
        const { config } = serverInfo;

        return this.#authProviderFactory
          .createOAuthClientProvider(serverInfo)
          .mapErr((e) => TransportError.creationFailed(serverInfo.name, serverInfo.config.type, e))
          .andThen((authProvider) =>
            okAsync(
              new SSEClientTransport(config.url, {
                authProvider,
                fetch: (url, init) => this.#lsFetch.fetchBase(url, init),
                requestInit: config.headers ? { headers: config.headers } : undefined,
              }),
            ),
          );
      }

      case 'http': {
        const { config } = serverInfo;

        return this.#authProviderFactory
          .createOAuthClientProvider(serverInfo)
          .mapErr((e) => TransportError.creationFailed(serverInfo.name, serverInfo.config.type, e))
          .andThen((authProvider) =>
            okAsync(
              new StreamableHTTPClientTransport(config.url, {
                authProvider,
                fetch: (url, init) => this.#lsFetch.fetchBase(url, init),
                requestInit: config.headers ? { headers: config.headers } : undefined,
              }),
            ),
          );
      }

      default:
        return errAsync(
          TransportError.invalidConfig(
            serverInfo.name,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            `Unsupported transport type: ${(serverInfo.config as any).type}`,
          ),
        );
    }
  }
}
