import { updateOrigin } from './update_origin';

describe('updateOrigin', () => {
  it.each`
    origin                   | html                                    | expectedHtml
    ${undefined}             | ${"img-src 'self' {{origin}} 'origin'"} | ${"img-src 'self' 'origin'"}
    ${undefined}             | ${"img-src{{origin}} 'self' 'origin'"}  | ${"img-src 'self' 'origin'"}
    ${undefined}             | ${"img-src 'self' 'origin' {{origin}}"} | ${"img-src 'self' 'origin'"}
    ${''}                    | ${"img-src 'self' {{origin}} 'origin'"} | ${"img-src 'self' 'origin'"}
    ${''}                    | ${"img-src{{origin}} 'self' 'origin'"}  | ${"img-src 'self' 'origin'"}
    ${''}                    | ${"img-src 'self' 'origin' {{origin}}"} | ${"img-src 'self' 'origin'"}
    ${'https://example.com'} | ${"img-src 'self' {{origin}} 'origin'"} | ${"img-src 'self' https://example.com 'origin'"}
    ${'https://example.com'} | ${"img-src 'self' 'origin' {{origin}}"} | ${"img-src 'self' 'origin' https://example.com"}
  `(
    'correctly updates origin on "$html" when origin="$origin"',
    ({ origin, html, expectedHtml }) => {
      const pipeline = [updateOrigin(origin)];

      const result = pipeline.reduce((currentHtml, transform) => transform(currentHtml), html);
      expect(result).toBe(expectedHtml);
    },
  );
});
