import { NotificationHandler, RequestHandler } from 'vscode-languageserver-protocol';

export interface HandlesRequest<P, R, E> {
  requestHandler: RequestHandler<P, R, E>;
}

export interface HandlesNotification<P> {
  notificationHandler: NotificationHandler<P>;
}
