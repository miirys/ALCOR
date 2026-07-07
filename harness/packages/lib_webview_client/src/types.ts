import { MessageBus, MessageMap } from '@gitlab-org/message-bus';

export interface HostConfig<WebviewMessageMap extends MessageMap = MessageMap> {
  host: MessageBus<WebviewMessageMap>;
}
