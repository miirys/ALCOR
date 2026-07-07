import { createHash } from 'node:crypto';

/**
 * SHA-256 hashes of instance URLs that are allowed to bypass the
 * `experiment_features_enabled` beta-access check.
 *
 * This is a temporary mechanism for SM instances running versions < 18.11
 * that do not expose the field. It will be removed at GA.
 *
 * **Only opaque hashes are stored here — never commit plaintext URLs.**
 *
 * To manage this list, use `scripts/dev/beta-allowlist.mjs`.
 */
const ALLOWED_INSTANCE_HASHES: readonly string[] = [
  'd379c2fbaa2bc0e778cf302becfc0904c5c31e4a8d239365441b7034d68f3a64',
  'dd6e920e32093f041d560e707f60957c9f640dbd5689b92170e4c8e29e6e87ae',
  '2e00136c43106631d8c0a6137a90001d031ae049020ab286c474ca0ec957be66',
  '74e8245b12d208714036ac7802cd0387df3d70a60ad2562d5d0e423ddca3e881',
  'fc1410cf3bbaa8fb737d07c2f5c3ee9421dd3064f5d64643b1f8f958d2b28005',
  'd70cbce01d4eadaf4f3a1745c3a7eb3ceeebb0eb5756581bed5a7f9131f0c6bf',
  '5950b4c31fc6f8e64f21786d0dee016ee67f6b488106efb7daa3d50759af09a8',
];

/**
 * Normalizes an instance URL for consistent hashing:
 * - lowercases the entire URL
 * - strips trailing slashes
 */
function normalizeInstanceUrl(url: string): string {
  return url.toLowerCase().replace(/\/+$/, '');
}

/**
 * Returns `true` when the given base URL matches an entry in the
 * pre-computed allowlist of beta instance hashes.
 */
export function isAllowlistedInstance(baseUrl: string): boolean {
  const normalized = normalizeInstanceUrl(baseUrl);
  const hash = createHash('sha256').update(normalized).digest('hex');
  return ALLOWED_INSTANCE_HASHES.includes(hash);
}
