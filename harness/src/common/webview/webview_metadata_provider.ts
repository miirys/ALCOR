import { WebviewId, WebviewPlugin } from '@gitlab-org/webview-plugin';
import { WebviewLocationService } from './webview_resource_location_service';

export type WebviewMetadata = {
  id: WebviewId;
  title: string;
  uris: string[];
};

export class WebviewMetadataProvider {
  #plugins: Set<WebviewPlugin>;

  #accessInfoProviders: WebviewLocationService;

  constructor(accessInfoProviders: WebviewLocationService, plugins: Set<WebviewPlugin>) {
    this.#accessInfoProviders = accessInfoProviders;
    this.#plugins = plugins;
  }

  getMetadata(): WebviewMetadata[] {
    return Array.from(this.#plugins).map((plugin) => ({
      id: plugin.id,
      title: plugin.title,
      uris: this.#accessInfoProviders.resolveUris(plugin.id),
    }));
  }
}
