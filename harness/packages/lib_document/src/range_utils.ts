import { Position, Range } from 'vscode-languageserver-protocol';

function positionIsAfterOrEqual(pos: Position, other: Position): boolean {
  return pos.line > other.line || (pos.line === other.line && pos.character >= other.character);
}

function positionIsBeforeOrEqual(pos: Position, other: Position): boolean {
  return pos.line < other.line || (pos.line === other.line && pos.character <= other.character);
}

function rangesOverlap(range1: Range, range2: Range): boolean {
  return (
    positionIsBeforeOrEqual(range1.start, range2.end) &&
    positionIsAfterOrEqual(range1.end, range2.start)
  );
}

export function rangeOverlapsAny(range: Range, ranges: Range[]): boolean {
  return ranges.some((r) => rangesOverlap(range, r));
}

/**
 * Formats a Range into a human-readable location string.
 * Converts 0-indexed positions to 1-indexed for user display.
 *
 * @param range - The range to format
 * @returns A formatted string describing the range location
 */
export function formatRangeLocation(range: Range): string {
  // Convert to 1-indexed for user display
  const startLine = range.start.line + 1;
  const startCol = range.start.character + 1;
  const endLine = range.end.line + 1;
  const endCol = range.end.character + 1;

  const isSingleLine = startLine === endLine;
  if (isSingleLine) {
    const isSingleCol = startCol === endCol;
    if (isSingleCol) {
      return `line ${startLine}:${startCol}`;
    }
    return `line ${startLine}:${startCol}-${endCol}`;
  }

  return `line ${startLine}:${startCol} to line ${endLine}:${endCol}`;
}
