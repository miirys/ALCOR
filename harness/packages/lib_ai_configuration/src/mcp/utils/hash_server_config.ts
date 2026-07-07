import crypto from 'crypto';
import { ServerConfig } from '../config';

/** Canonicalize an object (deep, sorted keys) for stable hashing */
function canonicalize(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(canonicalize);
  // URL objects must be serialised to their string form before key-sorting,
  // otherwise JSON.stringify treats them as plain objects and produces "{}".
  if (v instanceof URL) return v.toString();
  if (v && typeof v === 'object') {
    const obj = v as Record<string, unknown>;
    return Object.fromEntries(
      Object.keys(obj)
        .sort()
        .map((k) => [k, canonicalize(obj[k])]),
    );
  }
  return v;
}

/**
 * Compute a stable SHA-256 hash of a ServerConfig for use in server approval.
 *
 * The approval decision is about whether to trust the server binary/endpoint,
 * so `approvedTools` is intentionally excluded: changing which tools are
 * pre-approved should not invalidate an existing server-level approval and
 * force the user to re-approve the server.
 *
 * The config is deep-canonicalized (keys sorted recursively) before hashing
 * so that key-insertion order does not affect the result.
 */
export function hashServerConfig(config: ServerConfig): string {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { approvedTools: _excluded, ...rest } = config;
  const normalized = JSON.stringify(canonicalize(rest));
  return crypto.createHash('sha256').update(normalized).digest('hex');
}
