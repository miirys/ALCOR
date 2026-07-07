import type { HtmlTransformStep } from '../types';

export const updateNonce =
  (nonce: string): HtmlTransformStep =>
  (html: string) =>
    html.replace(/{{nonce}}/g, nonce);
