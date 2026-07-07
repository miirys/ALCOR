/**
 * Format a tool response value for display in a code block.
 */
export function prettyResponse(value: unknown): string | null {
  if (value === null || value === undefined) return null;

  if (typeof value === 'string') {
    if (value.length === 0) return null;
    try {
      return JSON.stringify(JSON.parse(value), null, 2);
    } catch {
      return value;
    }
  }

  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    if ('content' in obj) {
      return prettyResponse(obj.content);
    }
    return JSON.stringify(value, null, 2);
  }

  return String(value);
}
