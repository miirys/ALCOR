/**
 * JSON Schema type compatibility checking.
 *
 * Models real-world coercion that the Python backend performs,
 * letting us warn on likely mistakes without blocking plausible configs.
 */

type SchemaType = string | string[] | undefined;

export type Compatibility = 'exact' | 'coercible' | 'incompatible' | 'unknown';

const COERCION_MAP: Record<string, Set<string>> = {
  string: new Set(['number', 'integer', 'boolean']),
  number: new Set(['integer', 'string']),
  integer: new Set(['number', 'string']),
  boolean: new Set(['string']),
  array: new Set([]),
  object: new Set([]),
};

export function checkTypeCompatibility(expected: SchemaType, actual: SchemaType): Compatibility {
  if (!expected || !actual) return 'unknown';

  const expectedTypes = Array.isArray(expected) ? expected : [expected];
  const actualTypes = Array.isArray(actual) ? actual : [actual];

  for (const e of expectedTypes) {
    for (const a of actualTypes) {
      if (e === a) return 'exact';
    }
  }

  for (const e of expectedTypes) {
    const coercible = COERCION_MAP[e];
    if (coercible) {
      for (const a of actualTypes) {
        if (coercible.has(a)) return 'coercible';
      }
    }
  }

  return 'incompatible';
}
