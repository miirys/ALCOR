/**
 * Pure helpers for AI Catalog flow URIs and global IDs.
 *
 * Kept free of Node, neverthrow, and DI imports so it can be consumed by
 * the browser bundle without dragging in `fs`, `path`, or backend services.
 */

const CATALOG_URI_PREFIX = 'gitlab-catalog://flow/';
const CATALOG_GLOBAL_ID_PREFIX = 'gid://gitlab/Ai::Catalog::Item/';

/**
 * Build a catalog URI from a numeric item id.
 *
 * The URI is opaque to the frontend; the backend dispatches to the catalog
 * store by URI scheme.
 */
export function buildCatalogFlowUri(itemId: string): string {
  return `${CATALOG_URI_PREFIX}${itemId}`;
}

/**
 * Build a catalog item global ID from a numeric id.
 */
export function buildCatalogItemGlobalId(itemId: string): string {
  return `${CATALOG_GLOBAL_ID_PREFIX}${itemId}`;
}

/**
 * Extract the numeric id from a catalog flow URI, or null if the URI is
 * not a catalog URI.
 */
export function parseCatalogFlowUri(uri: string): string | null {
  if (!uri.startsWith(CATALOG_URI_PREFIX)) {
    return null;
  }
  const id = uri.slice(CATALOG_URI_PREFIX.length);
  return id.length > 0 ? id : null;
}

/**
 * Returns true when the URI targets the AI Catalog flow store.
 */
export function isCatalogFlowUri(uri: string): boolean {
  return uri.startsWith(CATALOG_URI_PREFIX);
}
