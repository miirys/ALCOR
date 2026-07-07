import { createInterfaceId, Injectable } from '@gitlab/needle';
import { UserService } from '@gitlab-org/core';
import { NonceService } from '../nonce/nonce_service';
import {
  addAdditionalScripts,
  addContentSecurityPolicy,
  addNoncePlaceholders,
  updateNonce,
  updateOrigin,
} from './transformers';

export interface WebviewHtmlTransformer {
  transformHtml(html: string): string;
}

export const WebviewHtmlTransformer =
  createInterfaceId<WebviewHtmlTransformer>('WebviewHtmlTransformer');

type HtmlTransformStep = (html: string) => string;

@Injectable(WebviewHtmlTransformer, [NonceService, UserService])
export class DefaultWebviewHtmlTransformer {
  #nonceService: NonceService;

  #userService: UserService;

  constructor(nonceService: NonceService, userService: UserService) {
    this.#nonceService = nonceService;
    this.#userService = userService;
  }

  transformHtml(html: string): string {
    const nonce = this.#nonceService.generateNonce();

    const { user } = this.#userService;
    let origin: string | undefined;

    if (user?.avatarUrl) {
      try {
        // Only extract origin from HTTP/HTTPS URLs
        if (user.avatarUrl.startsWith('http://') || user.avatarUrl.startsWith('https://')) {
          origin = new URL(user.avatarUrl).origin;
        }
        // For data URIs, relative paths, or other formats, origin remains undefined
      } catch {
        // If URL parsing fails, origin remains undefined
        origin = undefined;
      }
    }

    const pipeline: HtmlTransformStep[] = [
      addAdditionalScripts,
      addNoncePlaceholders,
      addContentSecurityPolicy,
      updateNonce(nonce),
      updateOrigin(origin),
    ];

    return pipeline.reduce((currentHtml, transform) => transform(currentHtml), html);
  }
}
