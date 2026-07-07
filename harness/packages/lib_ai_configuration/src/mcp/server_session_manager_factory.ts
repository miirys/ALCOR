import { Logger } from '@gitlab-org/logging';
import { Service, ServiceLifetime } from '@gitlab/needle';
import type { ServerName } from './types';
import { McpConnectionFactory } from './client';
import { McpServerSessionManager } from './server_session_manager';

@Service({
  lifetime: ServiceLifetime.Singleton,
  dependencies: [McpConnectionFactory, Logger],
})
export class McpServerSessionManagerFactory {
  #connFactory: McpConnectionFactory;

  #logger: Logger;

  constructor(connFactory: McpConnectionFactory, logger: Logger) {
    this.#connFactory = connFactory;
    this.#logger = logger;
  }

  create(
    serverName: ServerName,
    displayName: string,
    initialConfig: unknown,
    workspacePath: string,
  ): McpServerSessionManager {
    return new McpServerSessionManager(
      serverName,
      displayName,
      initialConfig,
      workspacePath,
      this.#connFactory,
      this.#logger,
    );
  }
}
