import { WebviewInstanceInfo } from '../types';

export type WebviewSocketConnectionId = string & { __type: 'WebviewSocketConnectionId' };

export function buildConnectionId(
  webviewInstanceInfo: WebviewInstanceInfo,
): WebviewSocketConnectionId {
  return `${webviewInstanceInfo.webviewId}:${webviewInstanceInfo.webviewInstanceId}` as WebviewSocketConnectionId;
}
