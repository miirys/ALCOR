import fp from 'fastify-plugin';
import { WebviewHtmlTransformer } from '@gitlab-org/legacy-common';
import { htmlTransformerPlugin } from '../../http';

export interface HtmlTransformerPluginOptions {
  webviewHtmlTransformer: WebviewHtmlTransformer;
}

export const webviewHtmlTransformerPlugin = fp<HtmlTransformerPluginOptions>(
  async (fastify, { webviewHtmlTransformer }) => {
    await fastify.register(htmlTransformerPlugin, {
      transformHtml: (html: string) => webviewHtmlTransformer.transformHtml(html),
    });
  },
  {
    name: 'webview-html-transformer-plugin',
    encapsulate: false,
  },
);
