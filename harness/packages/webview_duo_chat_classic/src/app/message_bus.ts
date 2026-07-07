import { resolveMessageBus } from '@gitlab-org/webview-client';
import { DUO_CHAT_V2_WEBVIEW_ID, DuoChatWebviewMessages } from '../metadata';

export const messageBus = resolveMessageBus<DuoChatWebviewMessages>({
  webviewId: DUO_CHAT_V2_WEBVIEW_ID,
});
