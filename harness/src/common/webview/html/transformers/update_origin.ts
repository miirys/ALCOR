import type { HtmlTransformStep } from '../types';

export const updateOrigin =
  (origin?: string): HtmlTransformStep =>
  (html: string) =>
    html.replace(/(\s*){{origin}}(\s?)/g, (_, leadingSpace, trailingSpace) => {
      if (!origin) {
        if (trailingSpace) {
          return ' ';
        }
        return '';
      }
      // If origin exists, keep leading space, replace with origin, and keep trailing space
      return `${leadingSpace}${origin}${trailingSpace}`;
    });
