import { WebviewPlugin, WebviewId } from '@gitlab-org/webview-plugin';
import { WebviewMetadataProvider } from './webview_metadata_provider';
import { WebviewLocationService } from './webview_resource_location_service';

class MockWebviewLocationService extends WebviewLocationService {
  #uriMap = new Map<WebviewId, string[]>();

  setUris(webviewId: WebviewId, uris: string[]) {
    this.#uriMap.set(webviewId, uris);
  }

  resolveUris(webviewId: WebviewId): string[] {
    return this.#uriMap.get(webviewId) || [];
  }
}

describe('WebviewMetadataProvider', () => {
  let accessInfoProviders: MockWebviewLocationService;
  let plugins: Set<WebviewPlugin>;
  let provider: WebviewMetadataProvider;

  beforeEach(() => {
    accessInfoProviders = new MockWebviewLocationService();
    plugins = new Set<WebviewPlugin>();
    provider = new WebviewMetadataProvider(accessInfoProviders, plugins);
  });

  describe('getMetadata', () => {
    it('should return an empty array if no plugins are registered', () => {
      const metadata = provider.getMetadata();
      expect(metadata).toEqual([]);
    });

    it('should return metadata for registered plugins', () => {
      // write test

      const plugin1: WebviewPlugin = {
        id: 'plugin1' as WebviewId,
        title: 'Plugin 1',
        setup: () => {},
      };
      const plugin2: WebviewPlugin = {
        id: 'plugin2' as WebviewId,
        title: 'Plugin 2',
        setup: () => {},
      };
      plugins.add(plugin1);
      plugins.add(plugin2);

      accessInfoProviders.setUris(plugin1.id, ['uri1', 'uri2']);
      accessInfoProviders.setUris(plugin2.id, ['uri3', 'uri4']);

      const metadata = provider.getMetadata();

      expect(metadata).toEqual([
        {
          id: 'plugin1',
          title: 'Plugin 1',
          uris: ['uri1', 'uri2'],
        },
        {
          id: 'plugin2',
          title: 'Plugin 2',
          uris: ['uri3', 'uri4'],
        },
      ]);
    });
  });
});
