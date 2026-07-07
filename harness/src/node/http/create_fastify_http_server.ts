import fastify, { FastifyInstance, FastifyBaseLogger } from 'fastify';
import pino from 'pino';
import { withPrefix, Logger } from '@gitlab-org/logging';
import { FastifyPluginRegistration, AnyFastifyPluginRegistration } from './types';
import { createLoggerTransport } from './utils';

type CreateFastifyServerProps = {
  port: number;
  plugins: AnyFastifyPluginRegistration[];
  logger: Logger;
};

type CreateHttpServerResult = {
  address: URL;
  server: FastifyInstance;
  shutdown: () => Promise<void>;
};

export const createFastifyHttpServer = async (
  props: Partial<CreateFastifyServerProps>,
): Promise<CreateHttpServerResult> => {
  const { port = 0, plugins = [] } = props;
  const logger = props.logger && withPrefix(props.logger, '[HttpServer]:');
  const log = createFastifyLogger(logger);

  const server = fastify({
    forceCloseConnections: true,
    ignoreTrailingSlash: true,
    loggerInstance: log,
  });

  try {
    await registerPlugins(server, plugins, logger);
    const address = await startFastifyServer(server, port, logger);
    await server.ready();

    logger?.info(`server listening on ${address}`);

    return {
      address,
      server,
      shutdown: async () => {
        try {
          await server.close();
          logger?.info('server shutdown');
        } catch (err) {
          logger?.error('error during server shutdown', err as Error);
        }
      },
    };
  } catch (err) {
    logger?.error('error during server setup', err as Error);
    throw err;
  }
};

const registerPlugins = async (
  server: FastifyInstance,
  plugins: FastifyPluginRegistration[],
  logger?: Logger,
) => {
  await Promise.all(
    plugins.map(async ({ plugin, options }) => {
      try {
        await server.register(plugin, options ?? {});
      } catch (err) {
        logger?.error('Error during plugin registration', err as Error);
        throw err;
      }
    }),
  );
};

const startFastifyServer = (server: FastifyInstance, port: number, logger?: Logger): Promise<URL> =>
  new Promise((resolve, reject) => {
    try {
      server.listen({ port, host: '127.0.0.1' }, (err, address) => {
        if (err) {
          logger?.error(err);
          reject(err);
          return;
        }

        resolve(new URL(address));
      });
    } catch (error) {
      reject(error);
    }
  });

const createFastifyLogger = (logger?: Logger): FastifyBaseLogger | undefined =>
  logger ? pino(createLoggerTransport(logger)) : undefined;
