import { WebviewPlugin, WebviewId, CreatePluginMessageMap } from '@gitlab-org/webview-plugin';
import { KnowledgeGraphManager } from './knowledge_graph_manager';

export const KNOWLEDGE_GRAPH_WEBVIEW_ID = 'knowledge-graph' as WebviewId;
export const KNOWLEDGE_GRAPH_WEBVIEW_TITLE = 'Knowledge Graph';

export type KnowledgeGraphMessages = CreatePluginMessageMap<{
  pluginToExtension: {
    notifications: {
      ready: {
        url: string;
      };
    };
  };
  extensionToPlugin: {
    requests: {
      getUrl: {
        params: undefined;
        result: {
          url: string | undefined;
        };
      };
    };
  };
}>;

export interface KnowledgeGraphPluginParams {
  knowledgeGraphManager: KnowledgeGraphManager;
}

export const createKnowledgeGraphPlugin = ({
  knowledgeGraphManager,
}: KnowledgeGraphPluginParams): WebviewPlugin<KnowledgeGraphMessages> => ({
  id: KNOWLEDGE_GRAPH_WEBVIEW_ID,
  title: KNOWLEDGE_GRAPH_WEBVIEW_TITLE,
  setup: ({ extension }) => {
    knowledgeGraphManager.onServerStarted(({ url }) => {
      extension.sendNotification('ready', { url: url.toString() });
    });

    extension.onRequest('getUrl', async () => ({
      url: knowledgeGraphManager.getUrl()?.toString(),
    }));
  },
});
