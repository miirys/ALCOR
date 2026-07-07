import { IncomingMessage } from 'http';
import { AddressInfo } from 'net';
import fastifyCors from '@fastify/cors';
import { WebviewId } from '@gitlab-org/webview-plugin';
import { Logger } from '@gitlab-org/logging';
import { SocketIOWebViewTransport } from '@gitlab-org/webview-transport-socket-io';
import { Transport } from '@gitlab-org/webview-transport';
import { FastifyInstance } from 'fastify';
import {
  WebviewUriProviderRegistry,
  WebviewHtmlTransformer,
  NonceService,
} from '@gitlab-org/legacy-common';
import { createFastifyHttpServer, createFastifySocketIoPlugin } from './http';
import { createFastifyWebviewPlugin, WebviewHttpAccessInfoProvider } from './webview';

export interface SetupHttpOptions {
  isDev?: boolean;
  port?: number;
}

function isLocalhostOrigin(origin: string): boolean {
  try {
    const { hostname } = new URL(origin);
    return hostname === 'localhost' || hostname === '127.0.0.1';
  } catch {
    return false;
  }
}

export async function setupHttp(
  webviewIds: readonly WebviewId[],
  uriProviderRegistry: WebviewUriProviderRegistry,
  transportRegistry: Set<Transport>,
  webviewHtmlTransformer: WebviewHtmlTransformer,
  nonceService: NonceService,
  logger: Logger,
  options: SetupHttpOptions = {},
): Promise<AddressInfo> {
  const server = await initializeHttpServer(
    webviewIds,
    webviewHtmlTransformer,
    nonceService,
    logger,
    options,
  );

  uriProviderRegistry.register(
    new WebviewHttpAccessInfoProvider(server.addresses()?.[0], nonceService),
  );
  transportRegistry.add(new SocketIOWebViewTransport(server.io));

  return server.addresses()[0];
}

async function initializeHttpServer(
  webviewIds: readonly WebviewId[],
  webviewHtmlTransformer: WebviewHtmlTransformer,
  nonceService: NonceService,
  logger: Logger,
  { isDev = false, port = 0 }: SetupHttpOptions,
) {
  const { shutdown: fastifyShutdown, server } = await createFastifyHttpServer({
    port,
    plugins: [
      {
        plugin: fastifyCors,
        options: {
          origin: (
            origin: string | undefined,
            callback: (err: Error | null, ok: boolean) => void,
          ) => {
            try {
              if (origin === undefined) {
                logger?.debug('cors: Allowing request without origin header');
                callback(null, true);
                return;
              }

              const { hostname } = new URL(origin);
              if (hostname === 'localhost' || hostname === '127.0.0.1') {
                logger?.debug('cors: Allowing request from localhost');
                callback(null, true);
                return;
              }
            } catch (err) {
              logger?.error(`cors: Error reading origin: '${origin}'`, err);
              callback(err as Error, false);
              return;
            }

            logger?.debug(`cors: Denying origin: '${origin}'`);
            callback(new Error('Not allowed'), false);
          },
        },
      },
      createFastifySocketIoPlugin({
        allowRequest: (req: IncomingMessage, callback) => {
          const { origin } = req.headers;
          if (origin !== undefined) {
            if (isDev && isLocalhostOrigin(origin)) {
              logger?.debug('socket.io: Allowing localhost origin in dev mode');
            } else {
              logger?.debug(`socket.io: Unexpected origin header: ${JSON.stringify(origin)}`);
              callback(null, false);
              return;
            }
          }

          if (!nonceService.verifyIncomingCsrfToken(req)) {
            logger?.debug(
              // eslint-disable-next-line no-underscore-dangle
              `socket.io: Unable to verify CSRF token for request: ${JSON.stringify(req.headers._csrf)}`,
            );
            callback('Unauthenticated', false);
            return;
          }

          logger?.debug(`socket.io: Allowing request`);
          callback(null, true);
        },
      }),
      createFastifyWebviewPlugin({
        webviewIds,
        webviewHtmlTransformer,
      }),
      {
        plugin: async (app: FastifyInstance) => {
          app.get('/', () => {
            return { message: 'Hello, world!' };
          });

          if (isDev) {
            app.get('/api/dev/csrf-token', () => {
              logger?.debug('Dev: generating CSRF token');
              return { token: nonceService.generateCsrfToken() };
            });
          }
        },
        options: {},
      },
    ],
    logger,
  });

  const handleGracefulShutdown = async (signal: string) => {
    logger.info(`Received ${signal}. Shutting down...`);
    await server.io.close();
    await fastifyShutdown();
    logger.info('Shutdown complete. Exiting process.');
    process.exit(0);
  };

  process.on('SIGTERM', handleGracefulShutdown);
  process.on('SIGINT', handleGracefulShutdown);

  return server;
}
