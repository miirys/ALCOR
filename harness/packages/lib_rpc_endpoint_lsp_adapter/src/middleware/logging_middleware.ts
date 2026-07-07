import { Logger } from '@gitlab-org/logging';
import { Middleware, MiddlewareContext } from '../types';

export class LoggingMiddleware implements Middleware {
  #logger: Logger;

  constructor(logger: Logger) {
    this.#logger = logger;
  }

  async handle(
    params: unknown,
    next: (params: unknown) => Promise<unknown>,
    { endpoint }: MiddlewareContext,
  ): Promise<unknown> {
    this.#logger.debug(
      `[${endpoint.type.toUpperCase()}] ${endpoint.methodName} - Params: ${JSON.stringify(params, null, 2)}`,
    );

    const result = await next(params);

    if (endpoint.type === 'request') {
      this.#logger.debug(
        `[${endpoint.type.toUpperCase()}] ${endpoint.methodName} - Result: ${JSON.stringify(result, null, 2)}`,
      );
    }

    return result;
  }
}
