import type { SourceResolver } from './source_resolver';

/** A full URL (`scheme://...`) or scp-like (`user@host:path`) — git's `@` is structural, not a ref. */
function isUrlLike(input: string): boolean {
  return input.includes('://') || /^[^/]+@[^/]+:/.test(input);
}

function splitOn(input: string, sep: '#' | '@'): { base: string; ref?: string } {
  // `#` is unambiguous (first wins); `@` uses lastIndexOf so a trailing pin wins.
  const i = sep === '#' ? input.indexOf(sep) : input.lastIndexOf(sep);
  // No separator (-1) or a leading one (0) — nothing to split off.
  if (i <= 0) return { base: input };
  return { base: input.slice(0, i), ref: input.slice(i + 1) || undefined };
}

/** URLs pin with `#ref`; shorthand/paths pin with `@ref`. */
function splitRef(input: string): { base: string; ref?: string } {
  if (input.includes('#')) return splitOn(input, '#');
  return isUrlLike(input) ? { base: input } : splitOn(input, '@');
}

/**
 * URL source: the catch-all. Emits a `url` marketplace source, git-cloned by the
 * fetcher — `url` means "a URL git can clone", not an HTTP download. We do not
 * validate the URL shape; git is the authority.
 */
export const resolveUrlSource: SourceResolver = async (input) => {
  const { base, ref } = splitRef(input);
  return ref ? { source: 'url', url: base, ref } : { source: 'url', url: base };
};
