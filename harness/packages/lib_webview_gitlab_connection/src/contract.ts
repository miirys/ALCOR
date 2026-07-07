import type { WebviewId, CreateWebviewMessages } from '@gitlab-org/webview-plugin';
import type { GitLabConnectionInfo } from './types';

export const GITLAB_CONNECTION_WEBVIEW_ID =
  'system/gitlab-connection' as WebviewId<GitLabConnectionMessages>;

export type GitLabConnectionMessages = CreateWebviewMessages<{
  fromWebview: {
    notifications: {
      /** Frontend is ready to receive connection state */
      appReady: undefined;
    };
    requests: {
      /** On-demand poll for current state */
      getConnectionInfo: {
        params: undefined;
        result: GitLabConnectionInfo;
      };
    };
  };
  toWebview: {
    notifications: {
      /** Pushed whenever connection state changes */
      connectionStateChanged: GitLabConnectionInfo;
    };
    requests: {};
  };
}>;
