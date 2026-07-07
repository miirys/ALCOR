import { Logger } from '@gitlab-org/logging';
import { ExtensionMessageHandlerRegistry } from '../utils/extension_message_handler_registry';
import { isExtensionMessage } from '../utils/extension_message';

export const handleRequestMessage =
  (handlerRegistry: ExtensionMessageHandlerRegistry, logger: Logger) =>
  async (message: unknown): Promise<unknown> => {
    if (!isExtensionMessage(message)) {
      logger.debug(`Received invalid request message: ${JSON.stringify(message)}`);
      throw new Error('Invalid message format');
    }

    const { pluginId, type, payload } = message;
    try {
      const result = await handlerRegistry.handle({ pluginId, type }, payload);
      return result;
    } catch (error) {
      logger.error(
        `Failed to handle request for pluginId: ${pluginId}, type: ${type}, payload: ${JSON.stringify(payload)}`,
        error as Error,
      );

      throw error;
    }
  };
