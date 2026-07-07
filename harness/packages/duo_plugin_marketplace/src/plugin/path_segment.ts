const SAFE_SEGMENT = /^[a-zA-Z0-9._-]+$/;

/**
 * Validates a single untrusted path segment (marketplace name, plugin name,
 * source subdir, skill dir name). Rejects anything that could escape the
 * intended directory or be interpreted as a flag.
 */
export function isValidPathSegment(segment: string): boolean {
  if (typeof segment !== 'string' || segment.length === 0) {
    return false;
  }
  if (segment === '.' || segment === '..') {
    return false;
  }
  if (segment.startsWith('-')) {
    return false;
  }
  for (const char of segment) {
    if (char.charCodeAt(0) < 0x20 || char.charCodeAt(0) === 0x7f) {
      return false;
    }
  }
  return SAFE_SEGMENT.test(segment);
}

export function assertPathSegment(segment: string, label: string): void {
  if (!isValidPathSegment(segment)) {
    throw new Error(`Invalid ${label}: ${JSON.stringify(segment)} is not a safe path segment`);
  }
}
