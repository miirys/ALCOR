import { Connection } from 'vscode-languageserver';
import { Logger } from '@gitlab-org/logging';
import { AnyEndpoint, Endpoint } from '@gitlab-org/rpc-endpoint';
import { Middleware } from './types';
import { applyMiddleware, createMiddlewareContext } from './utils';
import { ErrorHandlingMiddleware, LoggingMiddleware } from './middleware';

export class EndpointConnectionAdapter {
  #connection: Connection;

  #middleware: Middleware[] = [];

  #logger: Logger;

  constructor(connection: Connection, middleware: Middleware[], logger: Logger) {
    this.#connection = connection;
    this.#middleware = [
      new ErrorHandlingMiddleware(logger),
      ...middleware,
      new LoggingMiddleware(logger),
    ];
    this.#logger = logger;
  }

  applyEndpoints(endpoints: AnyEndpoint[]): void {
    this.#logger.info(`Applying ${endpoints.length} endpoints to connection.`);

    endpoints.forEach((endpoint) => {
      const handler = applyMiddleware(
        (params: unknown) => Promise.resolve(endpoint.handle(params)),
        this.#middleware,
        createMiddlewareContext(endpoint),
      );

      switch (endpoint.type) {
        case 'notification':
          this.#connection.onNotification(endpoint.methodName, handler);
          this.#logger.debug(`Registered notification handler: ${endpoint.methodName}`);

          break;
        case 'request':
          this.#connection.onRequest(endpoint.methodName, handler);
          this.#logger.debug(`Registered request handler: ${endpoint.methodName}`);

          break;
        default: {
          this.#logger.warn(
            `Endpoint type not handled: ${(endpoint as Endpoint).methodName} (${(endpoint as Endpoint).type})`,
          );
        }
      }
    });
  }
}
