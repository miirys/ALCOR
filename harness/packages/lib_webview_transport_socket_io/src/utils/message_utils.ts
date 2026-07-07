export type SocketNotificationMessage = {
  type: string;
  payload: unknown;
};

export type SocketIoRequestMessage = {
  requestId: string;
  type: string;
  payload: unknown;
};

export type SocketResponseMessage = {
  requestId: string;
  type: string;
  payload: unknown;
  success: boolean;
  reason?: string | undefined;
};

export function isSocketNotificationMessage(
  message: unknown,
): message is SocketNotificationMessage {
  return (
    typeof message === 'object' &&
    message !== null &&
    'type' in message &&
    typeof message.type === 'string'
  );
}

export function isSocketRequestMessage(message: unknown): message is SocketIoRequestMessage {
  return (
    typeof message === 'object' &&
    message !== null &&
    'requestId' in message &&
    typeof message.requestId === 'string' &&
    'type' in message &&
    typeof message.type === 'string'
  );
}

export function isSocketResponseMessage(message: unknown): message is SocketResponseMessage {
  return (
    typeof message === 'object' &&
    message !== null &&
    'requestId' in message &&
    typeof message.requestId === 'string'
  );
}
