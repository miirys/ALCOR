import type { WebviewId } from '@gitlab-org/webview-plugin';
import type { FastifyPluginAsync } from 'fastify';
import { WebviewHtmlTransformer } from '@gitlab-org/legacy-common';
import { spaPlugin } from './webview_spa_router.plugin';
import { webviewHtmlTransformerPlugin } from './webview_html_transformer.plugin';

type ResolveWebviewResourcePathFunc = (webviewId: WebviewId) => string;

export type WebviewsPluginOptions = {
  webviewIds: readonly WebviewId[];
  resolveWebviewResourcePath: ResolveWebviewResourcePathFunc;
  webviewHtmlTransformer: WebviewHtmlTransformer;
};

export const webviewPlugin: FastifyPluginAsync<WebviewsPluginOptions> = async (
  fastify,
  { webviewIds, resolveWebviewResourcePath, webviewHtmlTransformer },
) => {
  await fastify.register(
    async (webviewCollectionContext) => {
      webviewCollectionContext.get('/', async (_request, reply) => {
        const urls = webviewIds.reduce(
          (acc, webviewId) => {
            acc[webviewId] = `/webview/${webviewId}/`;
            return acc;
          },
          {} as Record<WebviewId, string>,
        );
        await reply.send(urls);
      });

      await webviewCollectionContext.register(webviewHtmlTransformerPlugin, {
        webviewHtmlTransformer,
      });

      await Promise.all(
        webviewIds.map(async (webviewId) => {
          await webviewCollectionContext.register(
            async (webviewContext) => {
              await webviewContext.register(spaPlugin, {
                assetDir: resolveWebviewResourcePath(webviewId),
              });
            },
            {
              prefix: `/${webviewId}`,
            },
          );
        }),
      );
    },
    {
      prefix: '/webview',
    },
  );
};
