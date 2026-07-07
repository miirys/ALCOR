import type { PartialDeep } from 'type-fest';
import { Disposable } from '@gitlab-org/disposable';
import {
  MessageMap,
  MessageBus,
  MessageDefinitions,
  CreateMessageDefinitions,
} from '@gitlab-org/message-bus';

export { type MessageMap } from '@gitlab-org/message-bus';

/**
 * Base message definitions between server and webview
 */
export type WebviewMessages<
  TToWebview extends MessageDefinitions = MessageDefinitions,
  TFromWebview extends MessageDefinitions = MessageDefinitions,
> = {
  readonly toWebview: TToWebview;
  readonly fromWebview: TFromWebview;
};

/**
 * Helper type for creating message definitions with defaults
 */
export type CreateWebviewMessages<T extends PartialDeep<WebviewMessages>> = {
  readonly toWebview: CreateMessageDefinitions<T['toWebview']>;
  readonly fromWebview: CreateMessageDefinitions<T['fromWebview']>;
};

/**
 * Represents a unique identifier for a webview.
 */
export type WebviewId<TMessageMap extends WebviewMessages = WebviewMessages> = string & {
  readonly _type: 'WebviewId';
  readonly _messages: TMessageMap;
};

/**
 * Represents a unique identifier for instances of a webview.
 */
export type WebviewInstanceId = string & { readonly _type: 'WebviewInstanceId' };

export type WebviewAddress = {
  webviewId: WebviewId;
  webviewInstanceId: WebviewInstanceId;
};

export type WebviewMessageBusManagerHandler<T extends MessageMap> = (
  webviewInstanceId: WebviewInstanceId,
  messageBus: MessageBus<T>,
  // eslint-disable-next-line @typescript-eslint/no-invalid-void-type
) => Disposable | void;

export interface WebviewConnection<T extends WebviewMessages = WebviewMessages> {
  broadcast: <TMethod extends keyof T['toWebview']['notifications'] & string>(
    type: TMethod,
    payload: T['toWebview']['notifications'][TMethod],
  ) => void;
  onInstanceConnected: (
    handler: WebviewMessageBusManagerHandler<{
      inbound: T['fromWebview'];
      outbound: T['toWebview'];
    }>,
  ) => void;
}
