// packages/lib_ai_configuration/src/mcp/utils/slugify_server_name.ts

import { ServerName } from '../types';

/**
 * Convert an arbitrary server display name into a safe internal slug
 * that satisfies the ServerName regex: /^[a-zA-Z0-9_.-]+$/
 *
 * Rules:
 *  - Lowercase
 *  - Replace runs of non-alphanumeric/dot/hyphen chars with a single `_`
 *  - Trim leading/trailing `_`
 *  - Truncate to 250 chars (ServerName max)
 *  - Already-valid names pass through lowercased only
 *
 * Returns null if the input produces an empty slug.
 */
export function slugifyServerName(raw: string): ServerName | null {
  const slug = raw
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '_')
    .replace(/_{2,}/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 250);

  if (slug.length <= 0) {
    return null;
  }

  const parseResult = ServerName.safeParse(slug);
  return parseResult.success ? parseResult.data : null;
}
