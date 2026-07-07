import { createInterfaceId, Injectable } from '@gitlab/needle';
import { Logger, withPrefix } from '@gitlab-org/logging';
import { SystemContextManager } from '@gitlab-org/ai-context';
import { ConnectionService } from '@gitlab-org/legacy-common';

export interface SystemContextInitializedHandler {}

export const SystemContextInitializedHandler = createInterfaceId<SystemContextInitializedHandler>(
  'SystemContextInitializedHandler',
);

@Injectable(SystemContextInitializedHandler, [SystemContextManager, Logger, ConnectionService])
export class DefaultSystemContextInitializedHandler implements SystemContextInitializedHandler {
  #systemContextManager: SystemContextManager;

  #logger: Logger;

  constructor(
    systemContextManager: SystemContextManager,
    logger: Logger,
    connectionService: ConnectionService,
  ) {
    this.#systemContextManager = systemContextManager;
    this.#logger = withPrefix(logger, '[SystemContextInitializedHandler]');

    connectionService.registerInitializedHandler(() => {
      this.#systemContextManager.precalculateOnInitialized().catch((error) => {
        this.#logger.error('Failed to precalculate system context on initialized', error);
      });
    });
  }
}
