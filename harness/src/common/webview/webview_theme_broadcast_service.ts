import { WebviewRuntimeMessageBus } from '@gitlab-org/webview';
import { Disposable } from 'vscode-languageserver-protocol';
import { CompositeDisposable } from '@gitlab-org/disposable';
import { Logger } from '@gitlab-org/logging';
import { createInterfaceId, Injectable } from '@gitlab/needle';
import { ThemeProvider, THEME_CHANGE_NOTIFICATION_METHOD } from '@gitlab-org/webview-theme';

export interface WebviewThemeBroadcastService {}
export const WebviewThemeBroadcastService = createInterfaceId<WebviewThemeBroadcastService>(
  'WebviewThemeBroadcastService',
);

@Injectable(WebviewThemeBroadcastService, [ThemeProvider, WebviewRuntimeMessageBus, Logger])
export class DefaultWebviewThemeBroadcastService implements Disposable {
  #disposable: Disposable;

  constructor(
    themeProvider: ThemeProvider,
    webviewRuntimeMessageBus: WebviewRuntimeMessageBus,
    logger: Logger,
  ) {
    const compositeDisposable = new CompositeDisposable();

    // TODO: In the future this would be better done by injecting css variables into the response html
    compositeDisposable.add(
      webviewRuntimeMessageBus.subscribe('webview:connect', (address) => {
        logger.debug(`Webview connected: ${address.webviewInstanceId}. Sending theme info.`);

        const themeInfo = themeProvider.getTheme();
        webviewRuntimeMessageBus.publish('plugin:notification', {
          webviewId: address.webviewId,
          webviewInstanceId: address.webviewInstanceId,
          type: THEME_CHANGE_NOTIFICATION_METHOD,
          payload: themeInfo,
        });
      }),
    );

    compositeDisposable.add(
      themeProvider.onThemeChange((themeInfo) => {
        logger.debug('Theme changed. Sending theme info to all connected webviews.');

        webviewRuntimeMessageBus.publish('system:notification', {
          type: THEME_CHANGE_NOTIFICATION_METHOD,
          payload: themeInfo,
        });
      }),
    );

    this.#disposable = compositeDisposable;
  }

  dispose(): void {
    this.#disposable.dispose();
  }
}
