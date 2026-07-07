const MAX_PASTE_CHARS = 200;
const MAX_PASTE_LINES = 10;

export class TextBuffer {
  #lines: string[] = [''];

  #cursorLine = 0;

  #cursorColumn = 0;

  #pastedContent: string[] = [];

  onBufferChange: () => void = () => {}; // noop by default

  #isLargePaste(text: string): boolean {
    const lineCount = text.split('\n').length;
    return text.length > MAX_PASTE_CHARS || lineCount > MAX_PASTE_LINES;
  }

  #clearPasteBuffer() {
    this.#pastedContent = [];
  }

  get lines(): string[] {
    return [...this.#lines];
  }

  get cursor(): { line: number; column: number } {
    return { line: this.#cursorLine, column: this.#cursorColumn };
  }

  get text(): string {
    let text = this.#lines.join('\n');

    // Replace all placeholders with actual pasted content
    text = text.replace(/\[Pasted text #(\d+) - \d+ lines\]/g, (match, indexStr) => {
      const index = parseInt(indexStr, 10) - 1;
      return this.#pastedContent[index] ?? match;
    });
    return text;
  }

  setText(value: string) {
    if (value === this.text) {
      return;
    }

    this.#lines = value.split('\n');
    this.#clearPasteBuffer(); // Clear paste tracking on external text changes
    this.#cursorLine = this.#lines.length - 1;
    this.#cursorColumn = this.#lines[this.#cursorLine].length;
    this.onBufferChange();
  }

  constructor(initialValue: string = '') {
    this.setText(initialValue);
  }

  insert(rawInput: string, isPasted: boolean = false): void {
    let text = rawInput;

    if (isPasted && this.#isLargePaste(rawInput)) {
      const lineCount = rawInput.split('\n').length;
      const placeholderIndex = this.#pastedContent.length + 1;
      const placeholder = `[Pasted text #${placeholderIndex} - ${lineCount} lines]`;

      this.#pastedContent.push(rawInput);
      text = placeholder;
    } else {
      text = rawInput;
    }

    if (text.includes('\n')) {
      const parts = text.split('\n');
      const currentLine = this.#lines[this.#cursorLine];
      const before = currentLine.slice(0, this.#cursorColumn);
      const after = currentLine.slice(this.#cursorColumn);

      // First part goes to current line
      this.#lines[this.#cursorLine] = before + parts[0];

      // Insert middle parts as new lines
      for (let i = 1; i < parts.length; i++) {
        this.#lines.splice(this.#cursorLine + i, 0, parts[i]);
      }

      // Move cursor to end of inserted text
      this.#cursorLine += parts.length - 1;
      this.#cursorColumn = this.#lines[this.#cursorLine].length;

      // Append the after text to the last inserted line
      this.#lines[this.#cursorLine] += after;
    } else {
      // Single line insert
      const currentLine = this.#lines[this.#cursorLine];
      this.#lines[this.#cursorLine] =
        currentLine.slice(0, this.#cursorColumn) + text + currentLine.slice(this.#cursorColumn);
      this.#cursorColumn += text.length;
    }
    this.onBufferChange();
  }

  delete(): void {
    if (this.#cursorColumn > 0) {
      // Delete character before cursor in current line
      const line = this.#lines[this.#cursorLine];
      this.#lines[this.#cursorLine] =
        line.slice(0, this.#cursorColumn - 1) + line.slice(this.#cursorColumn);
      this.#cursorColumn--;
      this.onBufferChange();
    } else if (this.#cursorLine > 0) {
      // Merge with previous line
      const currentLine = this.#lines[this.#cursorLine];
      this.#cursorLine--;
      this.#cursorColumn = this.#lines[this.#cursorLine].length;
      this.#lines[this.#cursorLine] += currentLine;
      this.#lines.splice(this.#cursorLine + 1, 1);
      this.onBufferChange();
    }
  }

  deleteAfterCursor(): void {
    // If cursor not at end of line, delete character after cursor in current line
    if (this.#cursorColumn < this.#lines[this.#cursorLine].length) {
      const line = this.#lines[this.#cursorLine];
      this.#lines[this.#cursorLine] =
        line.slice(0, this.#cursorColumn) + line.slice(this.#cursorColumn + 1);
      this.onBufferChange();
      // Else if cursor not at very end of input, merge with following line
    } else if (this.#cursorLine < this.#lines.length - 1) {
      const currentLine = this.#lines[this.#cursorLine];
      this.#lines[this.#cursorLine] = currentLine + this.#lines[this.#cursorLine + 1];
      this.#lines.splice(this.#cursorLine + 1, 1);
      this.onBufferChange();
    }
  }

  deleteWordFromCursor(): void {
    const currentLine = this.#lines[this.#cursorLine];

    // If at end of line, merge with next line
    if (this.#cursorColumn >= currentLine.length) {
      if (this.#cursorLine < this.#lines.length - 1) {
        const nextLineContent = this.#lines[this.#cursorLine + 1];
        this.#lines[this.#cursorLine] = currentLine + nextLineContent;
        this.#lines.splice(this.#cursorLine + 1, 1);
        this.onBufferChange();
      }
      return;
    }

    let position = this.#cursorColumn;

    // Skip spaces forward
    while (position < currentLine.length && currentLine[position] === ' ') {
      position++;
    }

    // Skip word characters forward
    while (position < currentLine.length && currentLine[position] !== ' ') {
      position++;
    }

    // Delete from cursor to position
    this.#lines[this.#cursorLine] =
      currentLine.slice(0, this.#cursorColumn) + currentLine.slice(position);
    this.onBufferChange();
  }

  deleteLineToCursor(): void {
    // When at column 0, merge with the previous line — mirrors deleteWordToCursor's
    // start-of-line behavior so all "delete to cursor" operations are consistent.
    if (this.#cursorColumn === 0) {
      if (this.#cursorLine > 0) {
        const currentLineContent = this.#lines[this.#cursorLine];
        this.#cursorLine--;
        this.#cursorColumn = this.#lines[this.#cursorLine].length;
        this.#lines[this.#cursorLine] += currentLineContent;
        this.#lines.splice(this.#cursorLine + 1, 1);
        this.onBufferChange();
      }
      return;
    }

    const currentLine = this.#lines[this.#cursorLine];
    this.#lines[this.#cursorLine] = currentLine.slice(this.#cursorColumn);
    this.#cursorColumn = 0;
    this.onBufferChange();
  }

  deleteWordToCursor(): void {
    const currentLine = this.#lines[this.#cursorLine];

    // If at start of line, merge with previous line
    if (this.#cursorColumn === 0) {
      if (this.#cursorLine > 0) {
        const currentLineContent = this.#lines[this.#cursorLine];
        this.#cursorLine--;
        this.#cursorColumn = this.#lines[this.#cursorLine].length;
        this.#lines[this.#cursorLine] += currentLineContent;
        this.#lines.splice(this.#cursorLine + 1, 1);
        this.onBufferChange();
      }
      return;
    }

    let position = this.#cursorColumn - 1;

    // Skip spaces backwards
    while (position > 0 && currentLine[position] === ' ') {
      position--;
    }

    // Skip word characters backwards
    while (position > 0 && currentLine[position - 1] !== ' ') {
      position--;
    }

    // Delete from position to cursor
    this.#lines[this.#cursorLine] =
      currentLine.slice(0, position) + currentLine.slice(this.#cursorColumn);
    this.#cursorColumn = position;
    this.onBufferChange();
  }

  left(): void {
    if (this.#cursorColumn > 0) {
      this.#cursorColumn--;
      this.onBufferChange();
    } else if (this.#cursorLine > 0) {
      this.#cursorLine--;
      this.#cursorColumn = this.#lines[this.#cursorLine].length;
      this.onBufferChange();
    }
  }

  right(): void {
    if (this.#cursorColumn < this.#lines[this.#cursorLine].length) {
      this.#cursorColumn++;
      this.onBufferChange();
    } else if (this.#cursorLine < this.#lines.length - 1) {
      this.#cursorLine++;
      this.#cursorColumn = 0;
      this.onBufferChange();
    }
  }

  up(): void {
    if (this.#cursorLine > 0) {
      this.#cursorLine--;
      this.#cursorColumn = Math.min(this.#cursorColumn, this.#lines[this.#cursorLine].length);
      this.onBufferChange();
    }
  }

  down(): void {
    if (this.#cursorLine < this.#lines.length - 1) {
      this.#cursorLine++;
      this.#cursorColumn = Math.min(this.#cursorColumn, this.#lines[this.#cursorLine].length);
      this.onBufferChange();
    }
  }

  wordLeft(): void {
    const currentLine = this.#lines[this.#cursorLine];

    // If at start of line, move to end of previous line
    if (this.#cursorColumn === 0) {
      if (this.#cursorLine > 0) {
        this.#cursorLine--;
        this.#cursorColumn = this.#lines[this.#cursorLine].length;
        this.onBufferChange();
      }
      return;
    }

    let position = this.#cursorColumn - 1;

    // Skip spaces backwards
    while (position > 0 && currentLine[position] === ' ') {
      position--;
    }

    // Skip word characters backwards
    while (position > 0 && currentLine[position - 1] !== ' ') {
      position--;
    }

    this.#cursorColumn = position;
    this.onBufferChange();
  }

  wordRight(): void {
    const currentLine = this.#lines[this.#cursorLine];

    // If at end of line, move to end of first word on next line
    if (this.#cursorColumn >= currentLine.length) {
      if (this.#cursorLine < this.#lines.length - 1) {
        this.#cursorLine++;
        const nextLine = this.#lines[this.#cursorLine];
        let position = 0;

        // Skip spaces at start of next line
        while (position < nextLine.length && nextLine[position] === ' ') {
          position++;
        }

        // Skip to end of first word
        while (position < nextLine.length && nextLine[position] !== ' ') {
          position++;
        }

        this.#cursorColumn = position;
        this.onBufferChange();
      }
      return;
    }

    let position = this.#cursorColumn;
    const isOnSpace = currentLine[position] === ' ';
    const isAtWordStart = !isOnSpace && (position === 0 || currentLine[position - 1] === ' ');

    // If on a space, skip spaces and move to end of next word
    if (isOnSpace) {
      while (position < currentLine.length && currentLine[position] === ' ') {
        position++;
      }
      while (position < currentLine.length && currentLine[position] !== ' ') {
        position++;
      }
    }
    // If at start of a word, move to beginning of next word
    else if (isAtWordStart) {
      while (position < currentLine.length && currentLine[position] !== ' ') {
        position++;
      }
      while (position < currentLine.length && currentLine[position] === ' ') {
        position++;
      }
    }
    // If in middle of a word, move to end of next word
    else {
      while (position < currentLine.length && currentLine[position] !== ' ') {
        position++;
      }
      while (position < currentLine.length && currentLine[position] === ' ') {
        position++;
      }
      while (position < currentLine.length && currentLine[position] !== ' ') {
        position++;
      }
    }

    this.#cursorColumn = position;
    this.onBufferChange();
  }

  home(): void {
    this.#cursorColumn = 0;
    this.onBufferChange();
  }

  end(): void {
    this.#cursorColumn = this.#lines[this.#cursorLine].length;
    this.onBufferChange();
  }

  clear(): void {
    this.#lines = [''];
    this.#cursorLine = 0;
    this.#cursorColumn = 0;
    this.onBufferChange();
  }

  getWordToCursor(): string {
    const currentLine = this.#lines[this.#cursorLine];
    const textToCursor = currentLine.slice(0, this.#cursorColumn);

    // Find the last space before the cursor
    const lastSpaceIndex = textToCursor.lastIndexOf(' ');

    // Return the word from after the last space to the cursor
    return textToCursor.slice(lastSpaceIndex + 1);
  }

  getWordAtCursor(): string {
    const currentLine = this.#lines[this.#cursorLine];

    // Find the start of the word (last space before or at cursor)
    let startIndex = this.#cursorColumn;
    if (currentLine[startIndex] === ' ') {
      return '';
    }
    while (startIndex > 0 && currentLine[startIndex - 1] !== ' ') {
      startIndex--;
    }

    // Find the end of the word (next space after cursor)
    let endIndex = this.#cursorColumn;
    while (endIndex < currentLine.length && currentLine[endIndex] !== ' ') {
      endIndex++;
    }

    // Return the complete word
    return currentLine.slice(startIndex, endIndex);
  }

  replaceWordAtCursor(value: string): void {
    const currentLine = this.#lines[this.#cursorLine];

    // Find the start of the word (last space before or at cursor)
    let startIndex = this.#cursorColumn;
    while (startIndex > 0 && currentLine[startIndex - 1] !== ' ') {
      startIndex--;
    }

    // Find the end of the word (next space after cursor)
    let endIndex = this.#cursorColumn;
    while (endIndex < currentLine.length && currentLine[endIndex] !== ' ') {
      endIndex++;
    }

    // Replace the word with the new value
    this.#lines[this.#cursorLine] =
      currentLine.slice(0, startIndex) + value + currentLine.slice(endIndex);

    // Update cursor position to end of replaced word
    this.#cursorColumn = startIndex + value.length;
    this.onBufferChange();
  }
}
