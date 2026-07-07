import { splitLines } from '@gitlab-org/core';

type DiffLineType = 'add' | 'del' | 'context' | 'header';
export interface DiffLine {
  type: DiffLineType;
  content: string;
  oldLineNum?: number;
  newLineNum?: number;
}

function isMetadataHeader(line: string): boolean {
  return line.startsWith('---') || line.startsWith('+++') || line.startsWith('diff --git');
}

function isHunkHeader(line: string): boolean {
  return line.startsWith('@@');
}

function isAddition(line: string): boolean {
  return line.startsWith('+');
}

function isDeletion(line: string): boolean {
  return line.startsWith('-');
}

function isContext(line: string): boolean {
  return line.startsWith(' ');
}

function getLineType(line: string): DiffLineType | 'metadata' | null {
  if (isMetadataHeader(line)) return 'metadata';
  if (isHunkHeader(line)) return 'header';
  if (isAddition(line)) return 'add';
  if (isDeletion(line)) return 'del';
  if (isContext(line)) return 'context';
  return null;
}

/**
 * Parses a unified diff patch string into structured diff lines.
 *
 * @param patch - The unified diff patch string (output from diff.createPatch)
 * @returns Array of structured diff lines with type and line numbers
 */
export function parsePatchToDiffLines(patch: string): DiffLine[] {
  const lines = splitLines(patch);
  const parsedLines: DiffLine[] = [];

  let oldLineNum = 0;
  let newLineNum = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineType = getLineType(line);

    switch (lineType) {
      case 'header': {
        // try extract line numbers from hunk header
        const match = line.match(/@@ -(\d+),?\d* \+(\d+),?\d* @@/);
        if (match) {
          oldLineNum = parseInt(match[1], 10);
          newLineNum = parseInt(match[2], 10);
        }
        parsedLines.push({ type: 'header', content: line });
        break;
      }
      case 'add': {
        parsedLines.push({
          type: 'add',
          content: line.substring(1),
          newLineNum: newLineNum++,
        });
        break;
      }
      case 'del': {
        parsedLines.push({
          type: 'del',
          content: line.substring(1),
          oldLineNum: oldLineNum++,
        });
        break;
      }
      case 'context': {
        parsedLines.push({
          type: 'context',
          content: line.substring(1),
          oldLineNum: oldLineNum++,
          newLineNum: newLineNum++,
        });
        break;
      }
      case 'metadata':
      default:
        // unknown line type
        break;
    }
  }

  return parsedLines;
}
