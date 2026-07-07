import { NotificationType, RequestType } from 'vscode-jsonrpc';
import { RpcNotificationDefinition, RpcRequestDefinition } from '../types';

/**
 * Converts an RpcNotificationDefinition into a vscode-jsonrpc NotificationType.
 *
 * @param notification - The RpcNotificationDefinition to convert.
 * @returns A NotificationType compatible with vscode-jsonrpc.
 */
export const toVSCodeNotificationType = <TParams>(
  notification: RpcNotificationDefinition<TParams>,
): NotificationType<TParams> => {
  return new NotificationType<TParams>(notification.methodName);
};

/**
 * Converts an RpcRequestDefinition into a vscode-jsonrpc RequestType.
 *
 * @param request - The RpcRequestDefinition to convert.
 * @returns A RequestType compatible with vscode-jsonrpc.
 */
export const toVSCodeRequestType = <TParams, TResponse>(
  request: RpcRequestDefinition<TParams, TResponse>,
): RequestType<TParams, TResponse, void> => {
  return new RequestType<TParams, TResponse, void>(request.methodName);
};
