import { CreatePluginMessageMap, WebviewId } from '@gitlab-org/webview-plugin';

export const WEBVIEW_ID = 'security-vuln-details' as WebviewId;
export const WEBVIEW_TITLE = 'GitLab SAST Remote Scanner';

export type Vulnerability = {
  name: string;
  description: string;
  severity: string;
  location: {
    start_line: number;
    end_line: number;
    start_column: number;
    end_column: number;
  };
};

export type VulnerabilityDetailsMessages = CreatePluginMessageMap<{
  pluginToWebview: {
    notifications: {
      updateDetails: {
        vulnerability: Vulnerability;
        filePath: string;
        timestamp: string;
      };
    };
  };
  webviewToPlugin: {
    notifications: {
      openLink: {
        href: string;
      };
    };
  };
  extensionToPlugin: {
    notifications: {
      updateDetails: {
        vulnerability: Vulnerability;
        filePath: string;
        timestamp: string;
      };
    };
  };
}>;
