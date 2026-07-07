import { Logger } from '@gitlab-org/logging';
import { ExtensionMessageHandlerRegistry } from '../utils/extension_message_handler_registry';
import { isExtensionMessage } from '../utils/extension_message';

export const handleNotificationMessage =
  (handlerRegistry: ExtensionMessageHandlerRegistry, logger: Logger) =>
  async (message: unknown) => {
    if (!isExtensionMessage(message)) {
      logger.debug(`Received invalid request message: ${JSON.stringify(message)}`);
      return;
    }

    const { pluginId, type, payload } = message;
    try {
      await handlerRegistry.handle({ pluginId, type }, payload);
    } catch (error) {
      logger.error(
        `Failed to handle notification for pluginId: ${pluginId}, type: ${type}, payload: ${JSON.stringify(payload)}`,
        error as Error,
      );
    }
  };
