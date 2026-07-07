import type { MarketplaceSource } from '../../schema/marketplace_source';
import { resolveDirectorySource } from './directory_source';
import { resolveUrlSource } from './url_source';

/**
 * Recognises one shape of `<source>` input and returns a {@link MarketplaceSource},
 * or `null` if it does not apply. Resolvers are tried in order; the first
 * non-null result wins. To support a new source kind later (e.g. a raw URL to a
 * `marketplace.json`), add a resolver file and insert it before
 * {@link resolveUrlSource} (the catch-all, which always matches).
 */
export type SourceResolver = (input: string) => Promise<MarketplaceSource | null>;

const RESOLVERS: SourceResolver[] = [resolveDirectorySource, resolveUrlSource];

/**
 * Resolve a user-supplied `<source>` string into a {@link MarketplaceSource}.
 * Tries each resolver in order; the url resolver is the total fallback.
 */
export async function resolveSource(input: string): Promise<MarketplaceSource> {
  for (const resolver of RESOLVERS) {
    // eslint-disable-next-line no-await-in-loop -- resolvers are ordered; first match wins
    const result = await resolver(input);
    if (result) {
      return result;
    }
  }
  // resolveUrlSource never returns null, so this is unreachable in practice.
  throw new Error(`Could not resolve marketplace source: "${input}"`);
}
