import path from 'path';
import { FastifyPluginAsync } from 'fastify';
import fastifyStatic from '@fastify/static';

export interface SpaPluginOptions {
  assetDir: string; // on-disk directory of built assets
}

export const spaPlugin: FastifyPluginAsync<SpaPluginOptions> = async (fastify, { assetDir }) => {
  const root = path.resolve(path.normalize(assetDir));

  await fastify.register(fastifyStatic, {
    root,
    prefix: '/',
    dotfiles: 'deny',
    setHeaders: async (res) => {
      await res.setHeader('X-Content-Type-Options', 'nosniff');
      await res.setHeader('Referrer-Policy', 'no-referrer');
    },
  });

  fastify.setNotFoundHandler(async (request, reply) => {
    // Fastify's request.url contains only the path and query string (e.g., '/webview/duo-workflow-panel?_csrf=...')
    // The URL constructor requires either an absolute URL or a relative URL with a base.
    // Since we only need the pathname, we use a dummy base URL to parse the relative path.
    const { pathname } = new URL(request.url, 'http://localhost');
    const lastSegment = pathname.split('/').pop() || '';

    if (!path.extname(lastSegment)) {
      return reply.sendFile('index.html');
    }

    return reply.callNotFound();
  });
};
