const DEFAULT_LIMIT = 2000;
const MAX_OUTPUT_BYTES = 50 * 1024; // 50 KB

export const MAX_FILE_SIZE_MB = 20;
export const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

export interface SliceResult {
  /** The formatted output content */
  content: string;
  /** Whether the output was truncated by any limit */
  truncated: boolean;
  /** Total number of lines in the file */
  totalLines: number;
  /** 0-based index of the last line included in the output */
  lastLineIndex: number;
  /** The 0-based start offset used */
  startOffset: number;
}

/**
 * Slices file content by line offset and limit, applying a byte budget to prevent oversized responses.
 *
 * @param content - The full file content as a string
 * @param offset - 0-based line index to start from (optional, defaults to 0)
 * @param limit - Maximum number of lines to return (optional, defaults to DEFAULT_LIMIT)
 * @returns A SliceResult with the formatted content and truncation metadata
 */
export function sliceFileContent(content: string, offset?: number, limit?: number): SliceResult {
  const lines = content.split('\n');
  const totalLines = lines.length;
  const start = offset ?? 0;
  const lineLimit = limit ?? DEFAULT_LIMIT;
  const end = Math.min(start + lineLimit, totalLines);

  const collected: string[] = [];
  let bytes = 0;
  let truncatedByBytes = false;
  let lastIndex = Math.min(start, totalLines - 1);

  for (let i = start; i < end; i++) {
    const line = lines[i];
    const lineBytes = Buffer.byteLength(line, 'utf-8') + (collected.length > 0 ? 1 : 0);
    if (bytes + lineBytes > MAX_OUTPUT_BYTES) {
      truncatedByBytes = true;
      break;
    }

    collected.push(line);
    bytes += lineBytes;
    lastIndex = i;
  }

  const truncated = truncatedByBytes || end < totalLines || collected.length < end - start;

  return {
    content: collected.join('\n'),
    truncated,
    totalLines,
    lastLineIndex: lastIndex,
    startOffset: start,
  };
}

/**
 * Builds a pagination message appended to truncated output, telling the LLM
 * how to fetch the next chunk.
 */
export function buildPaginationMessage(result: SliceResult): string {
  if (!result.truncated) {
    return '';
  }

  const shownFrom = result.startOffset + 1;
  const shownTo = result.lastLineIndex + 1;
  const nextOffset = result.lastLineIndex + 1;

  return (
    `\n\n(Showing lines ${shownFrom}-${shownTo} of ${result.totalLines} total.` +
    ` Use offset=${nextOffset} to continue reading.)`
  );
}
