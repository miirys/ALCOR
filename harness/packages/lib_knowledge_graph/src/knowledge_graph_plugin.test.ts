import { createFakePartial } from '@gitlab-org/test-utils';
import { KnowledgeGraphManager } from './knowledge_graph_manager';
import {
  createKnowledgeGraphPlugin,
  KNOWLEDGE_GRAPH_WEBVIEW_ID,
  KNOWLEDGE_GRAPH_WEBVIEW_TITLE,
  KnowledgeGraphPluginParams,
} from './knowledge_graph_plugin';

describe('KnowledgeGraphWebviewPlugin', () => {
  let mockKnowledgeGraphManager: KnowledgeGraphManager;
  let mockSetupParams: {
    extension: {
      sendNotification: jest.Mock;
      onNotification: jest.Mock;
      sendRequest: jest.Mock;
      onRequest: jest.Mock;
    };
    webview: {
      id: string;
      title: string;
      broadcast: jest.Mock;
      onInstanceConnected: jest.Mock;
    };
  };
  let pluginParams: KnowledgeGraphPluginParams;

  beforeEach(() => {
    mockKnowledgeGraphManager = createFakePartial<KnowledgeGraphManager>({
      onServerStarted: jest.fn(),
      getUrl: jest.fn(),
    });

    mockSetupParams = {
      extension: {
        sendNotification: jest.fn(),
        onNotification: jest.fn(),
        sendRequest: jest.fn(),
        onRequest: jest.fn(),
      },
      webview: {
        id: KNOWLEDGE_GRAPH_WEBVIEW_ID,
        title: KNOWLEDGE_GRAPH_WEBVIEW_TITLE,
        broadcast: jest.fn(),
        onInstanceConnected: jest.fn(),
      },
    };

    pluginParams = {
      knowledgeGraphManager: mockKnowledgeGraphManager,
    };
  });

  it('should create a plugin with the correct id and title', () => {
    const plugin = createKnowledgeGraphPlugin(pluginParams);

    expect(plugin.id).toBe(KNOWLEDGE_GRAPH_WEBVIEW_ID);
    expect(plugin.title).toBe(KNOWLEDGE_GRAPH_WEBVIEW_TITLE);
  });

  it('should send ready notification when the knowledge graph is ready', () => {
    const plugin = createKnowledgeGraphPlugin(pluginParams);
    const testUrl = new URL('http://localhost:3000');

    plugin.setup(mockSetupParams);

    // Simulate the Knowledge Graph server starting by invoking the registered listener
    const registeredListener = jest.mocked(mockKnowledgeGraphManager.onServerStarted).mock
      .calls[0]?.[0];

    expect(registeredListener).toBeDefined();

    registeredListener!({ url: testUrl });

    expect(mockSetupParams.extension.sendNotification).toHaveBeenCalledTimes(1);
    expect(mockSetupParams.extension.sendNotification).toHaveBeenCalledWith('ready', {
      url: testUrl.toString(),
    });
  });

  describe('getUrl request', () => {
    it('should handle getUrl request and return URL when available', async () => {
      const plugin = createKnowledgeGraphPlugin(pluginParams);
      const testUrl = new URL('http://localhost:3000');
      jest.mocked(mockKnowledgeGraphManager.getUrl).mockReturnValue(testUrl);

      plugin.setup(mockSetupParams);

      // Find the getUrl request handler
      const getUrlHandler = mockSetupParams.extension.onRequest.mock.calls.find(
        (call) => call[0] === 'getUrl',
      )?.[1];

      expect(getUrlHandler).toBeDefined();

      const result = await getUrlHandler();
      expect(result).toEqual({ url: testUrl.toString() });
    });

    it('should handle getUrl request and return undefined when URL is not available', async () => {
      const plugin = createKnowledgeGraphPlugin(pluginParams);
      jest.mocked(mockKnowledgeGraphManager.getUrl).mockReturnValue(undefined);

      plugin.setup(mockSetupParams);

      // Find the getUrl request handler
      const getUrlHandler = mockSetupParams.extension.onRequest.mock.calls.find(
        (call) => call[0] === 'getUrl',
      )?.[1];

      expect(getUrlHandler).toBeDefined();

      const result = await getUrlHandler();
      expect(result).toEqual({ url: undefined });
    });
  });
});
