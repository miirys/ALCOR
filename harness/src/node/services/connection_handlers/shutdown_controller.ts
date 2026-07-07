import { z } from 'zod';
import { Injectable } from '@gitlab/needle';
import { Controller, endpoint, EndpointProvider } from '@gitlab-org/rpc-endpoint';
import { Logger, withPrefix } from '@gitlab-org/logging';
import { InferResponse, declareRequest } from '@gitlab-org/rpc';
import { ExecutorManager } from '@gitlab-org/workflow-executor/node';

const ShutdownEndpoints = {
  SHUTDOWN: 'shutdown',
} as const;

const ShutdownResponseSchema = z.null();

const ShutdownRequest = declareRequest(ShutdownEndpoints.SHUTDOWN)
  .withResponse(ShutdownResponseSchema)
  .build();

@Injectable(EndpointProvider, [Logger, ExecutorManager])
export class ShutdownController extends Controller {
  #logger: Logger;

  #executorManager: ExecutorManager;

  constructor(logger: Logger, executorManager: ExecutorManager) {
    super();
    this.#logger = withPrefix(logger, '[ShutdownController]');

    this.#executorManager = executorManager;
  }

  @endpoint(ShutdownRequest)
  async shutdown(): Promise<InferResponse<typeof ShutdownRequest>> {
    this.#logger.debug('Performing cleanup');
    await this.#executorManager.disposeAsync();
    return null;
  }
}
