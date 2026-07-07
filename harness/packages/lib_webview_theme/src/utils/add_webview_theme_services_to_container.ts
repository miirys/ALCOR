import { createInstanceDescriptor, ServiceCollection } from '@gitlab/needle';
import { Logger } from '@gitlab-org/logging';
import { ThemeProvider, ThemePublisher } from '../types';
import { ThemeService } from '../services/theme_service';
import { DefaultThemeNotificationHandler, ThemeNotificationHandler } from '../handlers';

export const addWebviewThemeServicesToContainer = (
  container: ServiceCollection,
  logger: Logger,
): void => {
  const themeService = new ThemeService();

  container.add(
    createInstanceDescriptor({
      aliases: [ThemeProvider, ThemePublisher],
      instance: themeService,
    }),

    createInstanceDescriptor({
      aliases: [ThemeNotificationHandler],
      instance: new DefaultThemeNotificationHandler(themeService, logger),
    }),
  );
};
