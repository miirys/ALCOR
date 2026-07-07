const MAX_PREVIEW_LINES = 5;
const MAX_LINE_LENGTH = 120;

export const truncate = (text: string): string =>
  text
    .split('\n')
    .slice(0, MAX_PREVIEW_LINES)
    .map((line) =>
      line.length <= MAX_LINE_LENGTH ? line : `${line.slice(0, MAX_LINE_LENGTH - '...'.length)}...`,
    )
    .join('\n');

export const isTruncatable = (text: string): boolean => truncate(text).length !== text.length;

export const truncateToWidth = (text: string, maxWidth: number): string =>
  text.length <= maxWidth ? text : `${text.slice(0, Math.max(0, maxWidth - 1))}…`;

// Tool outputs are often a stringified JSON object/array on a single line, which
// truncates into an unreadable fragment. Pretty-print those so line-based
// truncation reveals the structure; leave everything else untouched.
export const formatJsonOutput = (text: string): string => {
  try {
    const parsed: unknown = JSON.parse(text.trim());
    if (typeof parsed === 'object' && parsed !== null) {
      return JSON.stringify(parsed, null, 2);
    }
  } catch {
    // not JSON
  }
  return text;
};
