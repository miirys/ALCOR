import { Position, TextEdit } from 'vscode-languageserver-protocol';

const NEWLINE_REGEX = /\r\n|\n|\r/;

/**
 * Creates TextEdit objects for replacing all occurrences of oldString with newString.
 */
export function createTextEditsFromContent(
  fullText: string,
  oldString: string,
  newString: string,
): TextEdit[] {
  if (!fullText || !oldString || !oldString.length) {
    return [];
  }

  const textEdits: TextEdit[] = [];
  let searchStart = 0;
  let foundIndex = fullText.indexOf(oldString, searchStart);

  while (foundIndex !== -1) {
    const startPos = indexToPosition(fullText, foundIndex);
    const endPos = indexToPosition(fullText, foundIndex + oldString.length);

    const textEdit = {
      range: { start: startPos, end: endPos },
      newText: newString,
    };

    textEdits.push(textEdit);

    searchStart = foundIndex + oldString.length;
    foundIndex = fullText.indexOf(oldString, searchStart);
  }

  return textEdits;
}

/**
 * Converts a string index to an LSP Position (line/character coordinates).
 */
function indexToPosition(text: string, index: number): Position {
  const textUpToIndex = text.substring(0, index);
  const lines = textUpToIndex.split(NEWLINE_REGEX);

  const lastLine = lines[lines.length - 1] ?? '';
  return {
    line: lines.length - 1,
    character: lastLine.length,
  };
}
