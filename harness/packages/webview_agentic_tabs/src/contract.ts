import { CreatePluginMessageMap, WebviewId } from '@gitlab-org/webview-plugin';

export const WEBVIEW_ID = 'agentic-tabs' as WebviewId;
export const WEBVIEW_TITLE = 'GitLab Duo Agent Platform';

export type DuoAgenticTabMessages = CreatePluginMessageMap<Record<string, never>>;
