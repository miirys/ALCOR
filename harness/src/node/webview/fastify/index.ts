import path from 'path';
import { WebviewId } from '@gitlab-org/webview-plugin';
import { WebviewHtmlTransformer } from '@gitlab-org/legacy-common';
import { FastifyPluginRegistration } from '../../http';
import { getAssetsRootPath } from '../../assets_manager';
import { WEBVIEW_BASE_PATH } from '../constants';
import { webviewPlugin, WebviewsPluginOptions } from './webviews.plugin';

export type CreateFastifyWebviewPluginOptions = {
  webviewIds: readonly WebviewId[];
  webviewHtmlTransformer: WebviewHtmlTransformer;
};

export const createFastifyWebviewPlugin = (
  options: CreateFastifyWebviewPluginOptions,
): FastifyPluginRegistration<WebviewsPluginOptions> => ({
  plugin: webviewPlugin,
  options: {
    ...options,
    resolveWebviewResourcePath: (webviewId: WebviewId) => {
      const assetsRootPath = getAssetsRootPath();
      const result: string = path.join(assetsRootPath, WEBVIEW_BASE_PATH, webviewId);
      return result;
    },
  },
});
