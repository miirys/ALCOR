import { NotificationType, NotificationHandler } from 'vscode-languageserver';
import { createInterfaceId } from '@gitlab/needle';
import { Logger } from '@gitlab-org/logging';
import { ThemePublisher, isThemeInfo } from '../types';

export const DidChangeThemeNotificationType = new NotificationType('$/gitlab/theme/didChangeTheme');

export interface ThemeNotificationHandler {
  handleThemeChange: NotificationHandler<unknown>;
}

export const ThemeNotificationHandler = createInterfaceId<ThemeNotificationHandler>(
  'ThemeNotificationHandler',
);

export class DefaultThemeNotificationHandler implements ThemeNotificationHandler {
  #publisher: ThemePublisher;

  #logger: Logger;

  constructor(publisher: ThemePublisher, logger: Logger) {
    this.#publisher = publisher;
    this.#logger = logger;
  }

  handleThemeChange = (message: unknown) => {
    if (!isThemeInfo(message)) {
      this.#logger.error(`Invalid theme info format ${JSON.stringify(message)}`);
      return;
    }

    this.#publisher.publishTheme(message);
  };
}
