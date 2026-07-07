import { AddressInfo } from 'net';
import { WebviewId } from '@gitlab-org/webview-plugin';
import { WebviewUriProvider, NonceService } from '@gitlab-org/legacy-common';

export class WebviewHttpAccessInfoProvider implements WebviewUriProvider {
  #addressInfo: AddressInfo;

  #nonceService: NonceService;

  constructor(address: AddressInfo, nonceService: NonceService) {
    this.#addressInfo = address;
    this.#nonceService = nonceService;
  }

  getUri(webviewId: WebviewId): string {
    const csrfToken = this.#nonceService.generateCsrfToken();
    return `http://${this.#addressInfo.address}:${this.#addressInfo.port}/webview/${webviewId}?_csrf=${csrfToken}`;
  }
}
