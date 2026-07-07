import { CreatePluginMessageMap } from '@gitlab-org/webview-plugin';
import { DUO_CHAT_V2_WEBVIEW_ID, DuoChatWebviewMessages } from './metadata';
import { ActiveFileContext } from './plugin/chat/gitlab_chat_record_context';
import { PromptType } from './plugin/chat/client_prompt';

export const WEBVIEW_ID = DUO_CHAT_V2_WEBVIEW_ID;
export const WEBVIEW_TITLE = 'GitLab Duo Chat';

export type Messages = CreatePluginMessageMap<{
  pluginToWebview: DuoChatWebviewMessages['inbound'];
  webviewToPlugin: DuoChatWebviewMessages['outbound'];
  extensionToPlugin: {
    notifications: {
      newPrompt: {
        prompt: PromptType;
        fileContext: ActiveFileContext;
      };
    };
  };
  pluginToExtension: {
    notifications: {
      appReady: undefined;
      showMessage: {
        type: 'error' | 'warning' | 'info';
        message: string;
      };
      insertCodeSnippet: {
        snippet: string;
      };
      copyCodeSnippet: {
        snippet: string;
      };
      copyMessage: {
        message: string;
      };
      focusChange: {
        isFocused: boolean;
      };
      openLink: {
        href: string;
      };
    };
    requests: {
      getCurrentFileContext: {
        params: undefined;
        result: ActiveFileContext;
      };
    };
  };
}>;
