import fastifySocketIO from 'fastify-socket';
import { Server, ServerOptions } from 'socket.io';
import { FastifyPluginRegistration } from '../types';

export const createFastifySocketIoPlugin = (
  options?: Partial<ServerOptions>,
): FastifyPluginRegistration<Partial<ServerOptions>> => {
  return {
    plugin: fastifySocketIO,
    options,
  };
};

declare module 'fastify' {
  interface FastifyInstance {
    io: Server;
  }
}
