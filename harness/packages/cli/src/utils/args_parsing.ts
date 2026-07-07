/**
 * Parse boolean values from environment variables or CLI flags.
 * Handles string representations like "true", "false", "1", "0", etc.
 */
export const parseBooleanOption = (value: string | boolean | undefined | null): boolean => {
  // If undefined or not provided, return false (default)
  if (!value) {
    return false;
  }

  // If already a boolean, return it
  if (typeof value === 'boolean') {
    return value;
  }

  // If it's a string, parse it
  if (typeof value === 'string') {
    const normalized = value.toLowerCase().trim();
    // Truthy values
    if (normalized === 'true' || normalized === '1' || normalized === 'yes') {
      return true;
    }
    // Falsy values
    if (normalized === 'false' || normalized === '0' || normalized === 'no') {
      return false;
    }
    // Any other non-empty string is considered truthy (for backwards compatibility)
    return true;
  }

  // Fallback: coerce to boolean
  return Boolean(value);
};
