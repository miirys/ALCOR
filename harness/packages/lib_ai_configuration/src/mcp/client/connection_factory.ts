import { ResultAsync } from 'neverthrow';
import { Service, ServiceLifetime } from '@gitlab/needle';
import { Logger, withPrefix } from '@gitlab-org/logging';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { McpServerInfo } from '../types';
import { McpAuthFinalizerRegistry, McpAuthFlowController } from '../auth';
import { TransportFactory } from './transport/transport_factory';
import { McpError } from './errors';
import { boundProvider } from './transport/provider';
import { McpConnection, DefaultMcpConnection } from './connection';

@Service({
  lifetime: ServiceLifetime.Singleton,
  dependencies: [TransportFactory, McpAuthFlowController, McpAuthFinalizerRegistry, Logger],
})
export class McpConnectionFactory {
  #transportFactory: TransportFactory;

  #authFlowController: McpAuthFlowController;

  #authFinalizerRegistry: McpAuthFinalizerRegistry;

  #logger: Logger;

  constructor(
    transportFactory: TransportFactory,
    authFlowController: McpAuthFlowController,
    authFinalizerRegistry: McpAuthFinalizerRegistry,
    logger: Logger,
  ) {
    this.#transportFactory = transportFactory;
    this.#authFlowController = authFlowController;
    this.#authFinalizerRegistry = authFinalizerRegistry;
    this.#logger = withPrefix(logger, '[MCP][ServerConnectionFactory]');
  }

  /**
   * Build an MCP client and attempt the initial connection.
   * Returns connected/authenticating connection, or error on failure.
   */
  connect(server: McpServerInfo, workspacePath: string): ResultAsync<McpConnection, McpError> {
    this.#logger.debug(`Creating client - server="${server.name}" type="${server.config.type}"`);

    // Construct SDK client (pure, no I/O)
    const sdkClient = new Client({ name: 'gitlab-language-server', version: '1.0.0' });

    const transportProvider = boundProvider(() =>
      this.#transportFactory.createTransport(server, workspacePath),
    );

    // 1) Create transport
    return (
      transportProvider
        .create()
        .mapErr((e) => McpError.transportCreationFailed(server.name, server.config.type, e))
        // 2) Attempt connection → map to ConnectionState
        .andThen((transport) => {
          const connection = new DefaultMcpConnection(
            sdkClient,
            transport,
            transportProvider,
            server,
            this.#logger,
            this.#authFlowController,
            this.#authFinalizerRegistry,
          );

          return connection.attemptConnect().map(() => connection);
        })
    );
  }
}
