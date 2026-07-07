import { MessageBus, MessageMap } from '@gitlab-org/message-bus';

export interface MessageBusProvider {
  name: string;
  getMessageBus<TMessages extends MessageMap>(webviewId: string): MessageBus<TMessages> | null;
}
