const CONTEXT_PREFIX = 'context:';
const STATUS_PREFIX = 'status:';

export type ReferencePrefix = 'context' | 'status';

/**
 * Parsed representation of a reference path with explicit prefix.
 *
 * Reference paths take the form `{prefix}:{root}` or `{prefix}:{root}.{field}`,
 * where `prefix` is `context` (variable bindings, edge conditions, etc.) or
 * `status` (node-status routing on edges).
 */
export type ReferencePath = {
  readonly prefix: ReferencePrefix;
  /** The first segment: node ID, node label, or workflow variable name. */
  readonly root: string;
  /** Output field after the first dot, or undefined for bare paths like "context:goal". */
  readonly field: string | undefined;
};

/**
 * Parsed representation of a context reference path. Equivalent to
 * `ReferencePath` constrained to `prefix === 'context'`.
 */
export type ContextPath = {
  readonly root: string;
  readonly field: string | undefined;
};

/**
 * Parse a reference path supporting either `context:` or `status:` prefixes.
 * Returns undefined if the path uses neither prefix.
 *
 * @example
 *   parseReferencePath('context:analyzer.findings')  // { prefix: 'context', root: 'analyzer', field: 'findings' }
 *   parseReferencePath('status:analyzer')            // { prefix: 'status',  root: 'analyzer', field: undefined }
 *   parseReferencePath('foo.bar')                    // undefined
 */
export function parseReferencePath(path: string): ReferencePath | undefined {
  let prefix: ReferencePrefix;
  let body: string;

  if (path.startsWith(CONTEXT_PREFIX)) {
    prefix = 'context';
    body = path.slice(CONTEXT_PREFIX.length);
  } else if (path.startsWith(STATUS_PREFIX)) {
    prefix = 'status';
    body = path.slice(STATUS_PREFIX.length);
  } else {
    return undefined;
  }

  // Reject prefix-only inputs ("context:", "status:") — an empty root is
  // never a valid reference and would otherwise produce confusing downstream
  // errors like '"" is not a known upstream node'.
  if (!body) return undefined;

  const dotIndex = body.indexOf('.');
  if (dotIndex < 0) return { prefix, root: body, field: undefined };
  return { prefix, root: body.slice(0, dotIndex), field: body.slice(dotIndex + 1) };
}

/**
 * Parse a context reference path into its constituent parts.
 * Returns undefined if the path does not start with "context:".
 *
 * @example
 *   parseContextPath('context:analyzer.findings')  // { root: 'analyzer', field: 'findings' }
 *   parseContextPath('context:goal')               // { root: 'goal', field: undefined }
 *   parseContextPath('status:ok')                  // undefined
 */
export function parseContextPath(path: string): ContextPath | undefined {
  const parsed = parseReferencePath(path);
  if (!parsed || parsed.prefix !== 'context') return undefined;
  return { root: parsed.root, field: parsed.field };
}

/**
 * Build a context path string from a root and optional field.
 *
 * @example
 *   buildContextPath('node-uuid', 'findings')  // 'context:node-uuid.findings'
 *   buildContextPath('goal', undefined)         // 'context:goal'
 */
export function buildContextPath(root: string, field: string | undefined): string {
  return field ? `${CONTEXT_PREFIX}${root}.${field}` : `${CONTEXT_PREFIX}${root}`;
}

/**
 * Replace the root segment of a context reference path, preserving the field.
 * Returns the original path unchanged if it is not a context reference.
 */
export function replaceContextPathRoot(path: string, newRoot: string): string {
  const ref = parseContextPath(path);
  if (!ref) return path;
  return buildContextPath(newRoot, ref.field);
}
