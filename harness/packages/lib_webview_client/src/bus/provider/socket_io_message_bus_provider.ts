import { MessageBus, MessageMap } from '@gitlab-org/message-bus';
import { io } from 'socket.io-client';
import { MessageBusProvider } from './types';
import { SocketIoMessageBus } from './socket_io_message_bus';

const getSocketUri = (webviewId: string) => `/webview/${webviewId}`;

export class SocketIoMessageBusProvider implements MessageBusProvider {
  readonly name = 'SocketIoMessageBusProvider';

  getMessageBus<TMessages extends MessageMap>(webviewId: string): MessageBus<TMessages> | null {
    if (!webviewId) {
      return null;
    }

    const socketUri = getSocketUri(webviewId);
    const socket = io(socketUri, {
      withCredentials: true,
      extraHeaders: {
        _csrf: this.#getCsrfTokenFromUrl(),
      },
    });
    const bus = new SocketIoMessageBus<TMessages>(socket);
    return bus;
  }

  #getCsrfTokenFromUrl(): string {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get('_csrf') || '';
  }
}
