import { FastifyPluginOptions, FastifyPluginAsync, FastifyPluginCallback } from 'fastify';

export type FastifyPluginRegistration<
  TPluginOptions extends FastifyPluginOptions = FastifyPluginOptions,
> = {
  plugin: FastifyPluginAsync<TPluginOptions> | FastifyPluginCallback<TPluginOptions>;
  options?: TPluginOptions;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyFastifyPluginRegistration = FastifyPluginRegistration<any>;
