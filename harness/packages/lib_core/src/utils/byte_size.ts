import { Buffer } from 'buffer';

export function getByteSize(str: string): number {
  return Buffer.from(str).byteLength;
}

/**
 * Truncates a string to a specified byte limit, attempting to break at word boundaries.
 * If no word boundary is found, truncates at the byte limit.
 *
 * @param str - The string to truncate
 * @param byteLimit - Maximum number of bytes allowed (including suffix if present)
 * @param options - Configuration options
 * @param options.separator - RegExp pattern to identify word boundaries (defaults to whitespace)
 * @param options.suffix - Text to append when truncation occurs
 * @returns The truncated string with optional suffix if truncation occurred
 */
export function truncateToByteLimit(
  str: string,
  byteLimit: number,
  options: { separator?: RegExp; suffix?: string } = {},
): string {
  const { separator = /\s+/g, suffix } = options;

  if (getByteSize(str) <= byteLimit) {
    return str;
  }

  const suffixBytes = suffix ? getByteSize(` ${suffix}`) : 0;
  const availableBytes = Math.max(0, byteLimit - suffixBytes);

  if (availableBytes === 0 && suffix) {
    return ` ${suffix}`.slice(0, byteLimit);
  }

  let truncated = Buffer.from(str).subarray(0, availableBytes).toString();

  const lastSeparatorMatch = [...truncated.matchAll(separator)].pop();
  if (lastSeparatorMatch) {
    truncated = truncated.slice(0, lastSeparatorMatch.index);
  }

  return suffix ? `${truncated} ${suffix}` : truncated;
}
