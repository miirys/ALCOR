import { MessageBus } from '@gitlab-org/message-bus';

export const createBridge = (messageBus: MessageBus) => ({
  async sendRequest<T = unknown>(eventName: string, payload?: unknown): Promise<T> {
    const result = await messageBus.sendRequest(eventName, payload);
    return result as T;
  },

  sendNotification(eventName: string, payload: unknown) {
    messageBus.sendNotification(eventName, payload);
  },

  sendGraphqlRequest(payload: unknown) {
    messageBus.sendNotification('getGraphqlData', payload);
  },

  setResponseListener(eventName: string, callback: () => void) {
    messageBus.onNotification(eventName, callback);
  },

  logToOutputChannel({ level, message }: { level: string; message: string }) {
    messageBus.sendNotification('logToOutputChannel', { level, message });
  },
});

export type Bridge = ReturnType<typeof createBridge>;
