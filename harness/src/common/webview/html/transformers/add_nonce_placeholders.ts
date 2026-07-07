import type { HtmlTransformStep } from '../types';

export const addNoncePlaceholders: HtmlTransformStep = (html: string) => {
  return html.replace(/<script(\s+[^>]*)?>/gi, (match, attributes) => {
    // Skip if already has nonce
    if (attributes?.includes('nonce=')) {
      return match;
    }

    // Add nonce placeholder
    return attributes ? `<script nonce="{{nonce}}"${attributes}>` : `<script nonce="{{nonce}}">`;
  });
};
