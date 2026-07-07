import { WebviewId } from '@gitlab-org/webview-plugin';

type Uri = string;

export interface WebviewUriProvider {
  getUri(webviewId: WebviewId): Uri | undefined;
}

export interface WebviewUriProviderRegistry {
  register(provider: WebviewUriProvider): void;
}

export class WebviewLocationService implements WebviewUriProviderRegistry {
  #uriProviders = new Set<WebviewUriProvider>();

  register(provider: WebviewUriProvider) {
    this.#uriProviders.add(provider);
  }

  resolveUris(webviewId: WebviewId): Uri[] {
    const uris: Uri[] = [];
    for (const provider of this.#uriProviders) {
      const uri = provider.getUri(webviewId);

      if (uri) {
        uris.push(uri);
      }
    }
    return uris;
  }
}
