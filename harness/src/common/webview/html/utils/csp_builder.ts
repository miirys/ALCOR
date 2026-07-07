const DEFAULT_CSP_DIRECTIVES: Record<string, string[]> = {
  'default-src': ["'self'"],
  'base-uri': ["'none'"],
  'script-src': ["'self'", "'nonce-{{nonce}}'"],
  'img-src': ["'self'", '{{origin}}', 'data:'],
  'style-src-elem': [
    "'self'",
    // Allow some inline Vue for the Duo Chat duo-ui component until we upgrade Vue to support nonces.
    "'sha256-47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU='",
    "'sha256-WVejwn4/prNTNpFpcqJ/OA464MhXp8Nbs3/42y4pvkw='",
  ],
};

export function buildCSP(): string {
  return Object.entries(DEFAULT_CSP_DIRECTIVES)
    .map(([directive, sources]) => {
      return `${directive} ${sources.join(' ')}`;
    })
    .join('; ');
}
