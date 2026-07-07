import { WebviewConnection } from '@gitlab-org/webview-plugin';
import { Disposable } from '@gitlab-org/disposable';
import { ThemeProvider } from '../types';
import { THEME_CHANGE_NOTIFICATION_METHOD } from '../constants';

export const setupWebviewThemeListener = (
  themeProvider: ThemeProvider,
  webview: WebviewConnection,
): Disposable => {
  const themeChangeSubscription = themeProvider.onThemeChange((themeInfo) => {
    webview.broadcast(THEME_CHANGE_NOTIFICATION_METHOD, themeInfo);
  });

  webview.onInstanceConnected((_, messageBus) => {
    messageBus.sendNotification(THEME_CHANGE_NOTIFICATION_METHOD, themeProvider.getTheme());
  });

  return themeChangeSubscription;
};
