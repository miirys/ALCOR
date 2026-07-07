import { Logger } from '@gitlab-org/logging';
import { Middleware, MiddlewareContext } from '../types';

export class ErrorHandlingMiddleware implements Middleware {
  #logger: Logger;

  constructor(logger: Logger) {
    this.#logger = logger;
  }

  async handle(
    params: unknown,
    next: (params: unknown) => Promise<unknown>,
    context: MiddlewareContext,
  ): Promise<unknown> {
    try {
      return await next(params);
    } catch (error) {
      this.#logger.error(`Error in endpoint handler: ${context.endpoint.methodName}`, error);

      // For notifications an error does not need to be thrown
      if (context.endpoint.type === 'notification') {
        return undefined;
      }

      throw error;
    }
  }
}
