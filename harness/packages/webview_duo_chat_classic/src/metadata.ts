import { WebviewId } from '@gitlab-org/webview-plugin';
import { CreateMessageMap } from '@gitlab-org/message-bus';
import { AIContextCategory, type AIContextItem } from '@gitlab-org/ai-context';
import { GitlabChatSlashCommand } from './plugin/chat/gitlab_chat_slash_commands';

export type DuoChatWebviewMessages = CreateMessageMap<{
  inbound: {
    notifications: {
      clearChat: undefined;
      newRecord: { record: { id: string } };
      updateRecord: { record: { id: string } };
      cancelPrompt: { canceledPromptRequestIds: string[] };
      focusChat: undefined;
      contextCategoriesResult: {
        categories: AIContextCategory[];
      };
      contextCurrentItemsResult: {
        items: AIContextItem[];
      };
      contextItemSearchResult: {
        results: AIContextItem[];
        errorMessage?: string;
      };
      setInitialState: {
        slashCommands: GitlabChatSlashCommand[];
      };
    };
  };
  outbound: {
    notifications: {
      appReady: undefined;
      newPrompt: {
        record: {
          content: string;
        };
      };
      trackFeedback: {
        data?: {
          improveWhat: string | null;
          didWhat: string | null;
          feedbackChoices: string[] | null;
        };
      };
      clearChat: {
        record: {
          content: string;
        };
      };
      insertCodeSnippet: {
        data?: {
          snippet: string | null;
        };
      };
      copyCodeSnippet: {
        data?: {
          snippet: string | null;
        };
      };
      copyMessage: {
        data?: {
          message: string | null;
        };
      };
      cancelPrompt: {
        canceledPromptRequestId: string;
      };
      searchContextItems: {
        query: {
          query: string;
          category: AIContextCategory;
        };
      };
      addContextItem: {
        item: AIContextItem;
      };
      removeContextItem: {
        item: AIContextItem;
      };
      getSelectedContextItemContent: {
        item: AIContextItem;
        messageId?: string;
      };
      focusChange: {
        isFocused: boolean;
      };
      openLink: {
        href: string;
      };
    };
  };
}>;

export const DUO_CHAT_V2_WEBVIEW_ID = 'duo-chat-v2' as WebviewId;
