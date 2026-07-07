import { describe, it, expect } from '@jest/globals';
import { TextBuffer } from './text_buffer';

describe('TextBuffer', () => {
  describe('multiline insert', () => {
    it('should insert multiline text and update cursor position', () => {
      const buffer = new TextBuffer();

      buffer.insert('hello\nworld\ntest');

      expect(buffer.lines).toEqual(['hello', 'world', 'test']);
      expect(buffer.cursor).toEqual({ line: 2, column: 4 });
    });

    it('should insert multiline text in the middle of existing text', () => {
      const buffer = new TextBuffer();
      buffer.insert('start');
      buffer.insert('middle\ninsert\nhere');
      buffer.insert('end');

      expect(buffer.lines).toEqual(['startmiddle', 'insert', 'hereend']);
      expect(buffer.cursor).toEqual({ line: 2, column: 7 });
    });

    it('should split line when inserting multiline text in the middle', () => {
      const buffer = new TextBuffer();
      buffer.insert('before_after');
      // Move cursor to position 7 (after "before_" and before "after")
      for (let i = 0; i < 5; i++) {
        buffer.left();
      }

      buffer.insert('line1\nline2');

      expect(buffer.lines).toEqual(['before_line1', 'line2after']);
      expect(buffer.cursor).toEqual({ line: 1, column: 5 });
    });
  });

  describe('large clipboard content handling', () => {
    it('should replace large pasted content with placeholder', () => {
      const buffer = new TextBuffer();

      const largePasteText = Array.from({ length: 15 }, (_, i) => `line ${i + 1}`).join('\n');

      // Insert with isPasted flag set to true
      buffer.insert(largePasteText, true);

      expect(buffer.lines).toEqual(expect.arrayContaining(['[Pasted text #1 - 15 lines]']));

      expect(buffer.text).toEqual(largePasteText);
    });
  });

  describe('setText', () => {
    it.each([
      { text: '1234567', expectedCursorPosition: 7 },
      { text: 'b', expectedCursorPosition: 1 },
      { text: '', expectedCursorPosition: 0 },
    ])(
      'should update cursor position when new value is provided',
      ({ text, expectedCursorPosition }) => {
        const buffer = new TextBuffer('123456');

        buffer.setText(text);
        expect(buffer.cursor.column).toBe(expectedCursorPosition);
      },
    );

    it('should not trigger onBufferChange when setting same value', () => {
      const buffer = new TextBuffer('hello');
      let callCount = 0;
      buffer.onBufferChange = () => callCount++;

      buffer.setText('hello');

      expect(callCount).toBe(0);
    });
  });

  describe('delete', () => {
    it('should delete character before cursor', () => {
      const buffer = new TextBuffer('hello');

      buffer.delete();

      expect(buffer.text).toBe('hell');
      expect(buffer.cursor).toEqual({ line: 0, column: 4 });
    });

    it('should do nothing when cursor is at start of buffer', () => {
      const buffer = new TextBuffer('hello');
      for (let i = 0; i < 5; i++) buffer.left();

      buffer.delete();

      expect(buffer.text).toBe('hello');
      expect(buffer.cursor).toEqual({ line: 0, column: 0 });
    });

    it('should merge lines when deleting at start of line', () => {
      const buffer = new TextBuffer('hello\nworld');
      // Move to start of second line
      buffer.setText('hello\nworld');
      for (let i = 0; i < 5; i++) buffer.left();

      buffer.delete();

      expect(buffer.lines).toEqual(['helloworld']);
      expect(buffer.cursor).toEqual({ line: 0, column: 5 });
    });
  });

  describe('deleteAfterCursor', () => {
    it('should delete character after cursor', () => {
      const buffer = new TextBuffer('abc123');
      buffer.left();
      buffer.left();

      buffer.deleteAfterCursor();

      expect(buffer.text).toBe('abc13');
      expect(buffer.cursor).toEqual({ line: 0, column: 4 });
    });

    it('should do nothing if character is at end of final line', () => {
      const buffer = new TextBuffer('abc123\ndef456');
      const { cursor } = buffer;
      buffer.deleteAfterCursor();

      expect(buffer.text).toBe('abc123\ndef456');
      expect(buffer.cursor).toStrictEqual(cursor);
    });

    it('should merge lines when deleting at end of line', () => {
      const firstLine = 'abc123';
      const secondLine = 'def456';
      const buffer = new TextBuffer(`${firstLine}\n${secondLine}`);
      // Move cursor to end of first line
      for (let i = 0; i < secondLine.length + 1; i++) {
        buffer.left();
      }
      const { cursor } = buffer;

      buffer.deleteAfterCursor();
      expect(buffer.text).toBe('abc123def456');
      expect(buffer.cursor).toStrictEqual(cursor);
    });
  });

  describe('cursor movement', () => {
    describe('left', () => {
      it('should move cursor left within line', () => {
        const buffer = new TextBuffer('hello');

        buffer.left();

        expect(buffer.cursor).toEqual({ line: 0, column: 4 });
      });

      it('should move to end of previous line when at start of line', () => {
        const buffer = new TextBuffer('hello\nworld');
        // Move to start of second line
        for (let i = 0; i < 5; i++) buffer.left();

        // Move one more left to go to end of first line
        buffer.left();

        expect(buffer.cursor).toEqual({ line: 0, column: 5 });
      });

      it('should not move when at start of buffer', () => {
        const buffer = new TextBuffer('hello');
        for (let i = 0; i < 5; i++) buffer.left();

        buffer.left();

        expect(buffer.cursor).toEqual({ line: 0, column: 0 });
      });
    });

    describe('right', () => {
      it('should move cursor right within line', () => {
        const buffer = new TextBuffer('hello');
        buffer.left();

        buffer.right();

        expect(buffer.cursor).toEqual({ line: 0, column: 5 });
      });

      it('should move to start of next line when at end of line', () => {
        const buffer = new TextBuffer('hello\nworld');
        for (let i = 0; i < 5; i++) buffer.left();

        buffer.right();

        expect(buffer.cursor).toEqual({ line: 1, column: 1 });
      });

      it('should not move when at end of buffer', () => {
        const buffer = new TextBuffer('hello');

        buffer.right();

        expect(buffer.cursor).toEqual({ line: 0, column: 5 });
      });
    });

    describe('up', () => {
      it('should move cursor up one line', () => {
        const buffer = new TextBuffer('hello\nworld');

        buffer.up();

        expect(buffer.cursor).toEqual({ line: 0, column: 5 });
      });

      it('should adjust column when moving to shorter line', () => {
        const buffer = new TextBuffer('hi\nlonger');

        buffer.up();

        expect(buffer.cursor).toEqual({ line: 0, column: 2 });
      });

      it('should not move when at first line', () => {
        const buffer = new TextBuffer('hello\nworld');
        buffer.up();

        buffer.up();

        expect(buffer.cursor).toEqual({ line: 0, column: 5 });
      });
    });

    describe('down', () => {
      it('should move cursor down one line', () => {
        const buffer = new TextBuffer('hello\nworld');
        buffer.up();

        buffer.down();

        expect(buffer.cursor).toEqual({ line: 1, column: 5 });
      });

      it('should adjust column when moving to shorter line', () => {
        const buffer = new TextBuffer('longer\nhi');
        buffer.up();

        buffer.down();

        expect(buffer.cursor).toEqual({ line: 1, column: 2 });
      });

      it('should not move when at last line', () => {
        const buffer = new TextBuffer('hello\nworld');

        buffer.down();

        expect(buffer.cursor).toEqual({ line: 1, column: 5 });
      });
    });

    describe('wordLeft', () => {
      it('should move to beginning of current word when in middle', () => {
        const buffer = new TextBuffer('hello world');
        buffer.left();
        buffer.left();

        buffer.wordLeft();

        expect(buffer.cursor).toEqual({ line: 0, column: 6 });
      });

      it('should move to beginning of previous word from start of current word', () => {
        const buffer = new TextBuffer('hello world');
        for (let i = 0; i < 5; i++) buffer.left();

        buffer.wordLeft();

        expect(buffer.cursor).toEqual({ line: 0, column: 0 });
      });

      it('should skip multiple spaces', () => {
        const buffer = new TextBuffer('hello   world');
        for (let i = 0; i < 5; i++) buffer.left();

        buffer.wordLeft();

        expect(buffer.cursor).toEqual({ line: 0, column: 0 });
      });

      it('should move to end of previous line when at start of line', () => {
        const buffer = new TextBuffer('hello\nworld');
        for (let i = 0; i < 5; i++) buffer.left();

        buffer.wordLeft();

        expect(buffer.cursor).toEqual({ line: 0, column: 5 });
      });

      it('should not move when at start of buffer', () => {
        const buffer = new TextBuffer('hello');
        for (let i = 0; i < 5; i++) buffer.left();

        buffer.wordLeft();

        expect(buffer.cursor).toEqual({ line: 0, column: 0 });
      });

      it('should handle single word', () => {
        const buffer = new TextBuffer('hello');

        buffer.wordLeft();

        expect(buffer.cursor).toEqual({ line: 0, column: 0 });
      });

      it('should move to beginning of word when cursor is on trailing space', () => {
        const buffer = new TextBuffer('hello world test');
        for (let i = 0; i < 5; i++) buffer.left();

        buffer.wordLeft();

        expect(buffer.cursor).toEqual({ line: 0, column: 6 });
      });
    });

    describe('wordRight', () => {
      it('should move to beginning of next word', () => {
        const buffer = new TextBuffer('hello world');
        for (let i = 0; i < 6; i++) buffer.left();

        buffer.wordRight();

        expect(buffer.cursor).toEqual({ line: 0, column: 11 });
      });

      it('should move from middle of word to next word', () => {
        const buffer = new TextBuffer('hello world');
        for (let i = 0; i < 9; i++) buffer.left();

        buffer.wordRight();

        expect(buffer.cursor).toEqual({ line: 0, column: 11 });
      });

      it('should skip multiple spaces', () => {
        const buffer = new TextBuffer('hello   world');
        for (let i = 0; i < 8; i++) buffer.left();

        buffer.wordRight();

        expect(buffer.cursor).toEqual({ line: 0, column: 13 });
      });

      it('should move to end of first word on next line when at end of line', () => {
        const buffer = new TextBuffer('hello\nworld');
        for (let i = 0; i < 5; i++) buffer.left();

        buffer.wordRight();

        expect(buffer.cursor).toEqual({ line: 1, column: 5 });
      });

      it('should not move when at end of buffer', () => {
        const buffer = new TextBuffer('hello');

        buffer.wordRight();

        expect(buffer.cursor).toEqual({ line: 0, column: 5 });
      });

      it('should move to end when single word', () => {
        const buffer = new TextBuffer('hello');
        for (let i = 0; i < 5; i++) buffer.left();

        buffer.wordRight();

        expect(buffer.cursor).toEqual({ line: 0, column: 5 });
      });

      it('should handle multiple words', () => {
        const buffer = new TextBuffer('one two three');
        for (let i = 0; i < 13; i++) buffer.left();

        buffer.wordRight();
        expect(buffer.cursor).toEqual({ line: 0, column: 4 });

        buffer.wordRight();
        expect(buffer.cursor).toEqual({ line: 0, column: 8 });

        buffer.wordRight();
        expect(buffer.cursor).toEqual({ line: 0, column: 13 });
      });
    });

    describe('home', () => {
      it('should move cursor to beginning of line', () => {
        const buffer = new TextBuffer('hello world');

        buffer.home();

        expect(buffer.cursor).toEqual({ line: 0, column: 0 });
      });

      it('should move to beginning when in middle of line', () => {
        const buffer = new TextBuffer('hello world');
        for (let i = 0; i < 5; i++) buffer.left();

        buffer.home();

        expect(buffer.cursor).toEqual({ line: 0, column: 0 });
      });

      it('should work on second line', () => {
        const buffer = new TextBuffer('hello\nworld');

        buffer.home();

        expect(buffer.cursor).toEqual({ line: 1, column: 0 });
      });

      it('should not change when already at beginning', () => {
        const buffer = new TextBuffer('hello');
        for (let i = 0; i < 5; i++) buffer.left();

        buffer.home();

        expect(buffer.cursor).toEqual({ line: 0, column: 0 });
      });
    });

    describe('end', () => {
      it('should move cursor to end of line', () => {
        const buffer = new TextBuffer('hello world');
        for (let i = 0; i < 11; i++) buffer.left();

        buffer.end();

        expect(buffer.cursor).toEqual({ line: 0, column: 11 });
      });

      it('should move to end when in middle of line', () => {
        const buffer = new TextBuffer('hello world');
        for (let i = 0; i < 5; i++) buffer.left();

        buffer.end();

        expect(buffer.cursor).toEqual({ line: 0, column: 11 });
      });

      it('should work on first line of multiline buffer', () => {
        const buffer = new TextBuffer('hello\nworld');
        buffer.up();
        buffer.home();

        buffer.end();

        expect(buffer.cursor).toEqual({ line: 0, column: 5 });
      });

      it('should not change when already at end', () => {
        const buffer = new TextBuffer('hello');

        buffer.end();

        expect(buffer.cursor).toEqual({ line: 0, column: 5 });
      });

      it('should work on empty line', () => {
        const buffer = new TextBuffer('hello\n\nworld');
        buffer.up();

        buffer.end();

        expect(buffer.cursor).toEqual({ line: 1, column: 0 });
      });
    });
  });

  describe('deleteLineToCursor', () => {
    it('should delete text from column 0 to cursor, retaining text after cursor', () => {
      const buffer = new TextBuffer('hello world');
      // Move cursor to after 'hello ' (column 6)
      for (let i = 0; i < 5; i++) buffer.left();

      buffer.deleteLineToCursor();

      expect(buffer.lines).toEqual(['world']);
      expect(buffer.cursor).toEqual({ line: 0, column: 0 });
    });

    it('should clear entire line when cursor is at end of a single-line input', () => {
      const buffer = new TextBuffer('hello');

      buffer.deleteLineToCursor();

      expect(buffer.lines).toEqual(['']);
      expect(buffer.cursor).toEqual({ line: 0, column: 0 });
    });

    it('should only affect the current line in a multiline buffer', () => {
      const buffer = new TextBuffer('first\nsecond\nthird');
      // Move cursor to the end of 'second' then 3 left → column 3 ('sec'|'ond')
      buffer.up();
      buffer.end();
      for (let i = 0; i < 3; i++) buffer.left();

      buffer.deleteLineToCursor();

      expect(buffer.lines).toEqual(['first', 'ond', 'third']);
      expect(buffer.cursor).toEqual({ line: 1, column: 0 });
    });

    it('should merge current line into previous line when cursorColumn is 0', () => {
      // Resolved decision: column-0 merges with previous line, matching deleteWordToCursor.
      const buffer = new TextBuffer('first\nsecond');
      // Move cursor to start of 'second'
      for (let i = 0; i < 6; i++) buffer.left();

      buffer.deleteLineToCursor();

      expect(buffer.lines).toEqual(['firstsecond']);
      expect(buffer.cursor).toEqual({ line: 0, column: 5 });
    });

    it('should do nothing when cursorColumn is 0 on the first line', () => {
      const buffer = new TextBuffer('hello');
      for (let i = 0; i < 5; i++) buffer.left();

      buffer.deleteLineToCursor();

      expect(buffer.lines).toEqual(['hello']);
      expect(buffer.cursor).toEqual({ line: 0, column: 0 });
    });
  });

  describe('clear', () => {
    it('should clear all content and reset cursor', () => {
      const buffer = new TextBuffer('hello\nworld\ntest');

      buffer.clear();

      expect(buffer.lines).toEqual(['']);
      expect(buffer.cursor).toEqual({ line: 0, column: 0 });
      expect(buffer.text).toBe('');
    });
  });

  describe('getWordToCursor', () => {
    it('should return word from last space to cursor', () => {
      const buffer = new TextBuffer('hello world');

      const word = buffer.getWordToCursor();

      expect(word).toBe('world');
    });

    it('should return entire line when no spaces', () => {
      const buffer = new TextBuffer('hello');

      const word = buffer.getWordToCursor();

      expect(word).toBe('hello');
    });

    it('should return partial word when cursor is mid-word', () => {
      const buffer = new TextBuffer('hello world');
      buffer.left();
      buffer.left();

      const word = buffer.getWordToCursor();

      expect(word).toBe('wor');
    });

    it('should return empty string when cursor is after space', () => {
      const buffer = new TextBuffer('hello ');

      const word = buffer.getWordToCursor();

      expect(word).toBe('');
    });
  });

  describe('getWordAtCursor', () => {
    it('should return complete word at cursor', () => {
      const buffer = new TextBuffer('hello world');
      for (let i = 0; i < 5; i++) buffer.left();

      const word = buffer.getWordAtCursor();

      expect(word).toBe('world');
    });

    it('should return word when cursor is at start of word', () => {
      const buffer = new TextBuffer('hello world');
      for (let i = 0; i < 11; i++) buffer.left();
      for (let i = 0; i < 6; i++) buffer.right();

      const word = buffer.getWordAtCursor();

      expect(word).toBe('world');
    });

    it('should return word when cursor is in middle of word', () => {
      const buffer = new TextBuffer('hello world');
      for (let i = 0; i < 8; i++) buffer.left();

      const word = buffer.getWordAtCursor();

      expect(word).toBe('hello');
    });

    it('should return empty string when cursor is on space', () => {
      const buffer = new TextBuffer('hello world');
      for (let i = 0; i < 6; i++) buffer.left();

      const word = buffer.getWordAtCursor();

      expect(word).toBe('');
    });

    it('should return single word when no spaces', () => {
      const buffer = new TextBuffer('hello');
      buffer.left();
      buffer.left();

      const word = buffer.getWordAtCursor();

      expect(word).toBe('hello');
    });
  });

  describe('replaceWordAtCursor', () => {
    it('should replace word at cursor', () => {
      const buffer = new TextBuffer('hello world');
      for (let i = 0; i < 5; i++) buffer.left();

      buffer.replaceWordAtCursor('universe');

      expect(buffer.text).toBe('hello universe');
      expect(buffer.cursor).toEqual({ line: 0, column: 14 });
    });

    it('should replace word when cursor is at start of word', () => {
      const buffer = new TextBuffer('hello world');
      for (let i = 0; i < 11; i++) buffer.left();
      for (let i = 0; i < 6; i++) buffer.right();

      buffer.replaceWordAtCursor('there');

      expect(buffer.text).toBe('hello there');
    });

    it('should replace word when cursor is in middle', () => {
      const buffer = new TextBuffer('hello world');
      for (let i = 0; i < 8; i++) buffer.left();

      buffer.replaceWordAtCursor('hi');

      expect(buffer.text).toBe('hi world');
      expect(buffer.cursor).toEqual({ line: 0, column: 2 });
    });

    it('should work with single word', () => {
      const buffer = new TextBuffer('hello');

      buffer.replaceWordAtCursor('goodbye');

      expect(buffer.text).toBe('goodbye');
      expect(buffer.cursor).toEqual({ line: 0, column: 7 });
    });
  });

  describe('onBufferChange callback', () => {
    it('should call onBufferChange when inserting text', () => {
      const buffer = new TextBuffer();
      let called = false;
      buffer.onBufferChange = () => {
        called = true;
      };

      buffer.insert('test');

      expect(called).toBe(true);
    });

    it('should call onBufferChange when deleting', () => {
      const buffer = new TextBuffer('hello');
      let called = false;
      buffer.onBufferChange = () => {
        called = true;
      };

      buffer.delete();

      expect(called).toBe(true);
    });

    it('should call onBufferChange when clearing', () => {
      const buffer = new TextBuffer('hello');
      let called = false;
      buffer.onBufferChange = () => {
        called = true;
      };

      buffer.clear();

      expect(called).toBe(true);
    });

    it('should call onBufferChange when moving cursor', () => {
      const buffer = new TextBuffer('hello');
      let callCount = 0;
      buffer.onBufferChange = () => callCount++;

      buffer.left();
      buffer.right();
      buffer.up();
      buffer.down();

      expect(callCount).toBe(2); // Only left and right should move in single line
    });

    it('should call onBufferChange when moving word left', () => {
      const buffer = new TextBuffer('hello world');
      let called = false;
      buffer.onBufferChange = () => {
        called = true;
      };

      buffer.wordLeft();

      expect(called).toBe(true);
    });

    it('should call onBufferChange when moving word right', () => {
      const buffer = new TextBuffer('hello world');
      for (let i = 0; i < 11; i++) buffer.left();
      let called = false;
      buffer.onBufferChange = () => {
        called = true;
      };

      buffer.wordRight();

      expect(called).toBe(true);
    });

    it('should call onBufferChange when pressing home', () => {
      const buffer = new TextBuffer('hello');
      let called = false;
      buffer.onBufferChange = () => {
        called = true;
      };

      buffer.home();

      expect(called).toBe(true);
    });

    it('should call onBufferChange when pressing end', () => {
      const buffer = new TextBuffer('hello');
      for (let i = 0; i < 5; i++) buffer.left();
      let called = false;
      buffer.onBufferChange = () => {
        called = true;
      };

      buffer.end();

      expect(called).toBe(true);
    });

    it('should call onBufferChange when replacing word', () => {
      const buffer = new TextBuffer('hello world');
      let called = false;
      buffer.onBufferChange = () => {
        called = true;
      };

      buffer.replaceWordAtCursor('test');

      expect(called).toBe(true);
    });

    it('should call onBufferChange when setting text', () => {
      const buffer = new TextBuffer('hello');
      let called = false;
      buffer.onBufferChange = () => {
        called = true;
      };

      buffer.setText('world');

      expect(called).toBe(true);
    });

    it('should call onBufferChange when deleteLineToCursor deletes text mid-line', () => {
      const buffer = new TextBuffer('hello');
      let called = false;
      buffer.onBufferChange = () => {
        called = true;
      };

      buffer.deleteLineToCursor();

      expect(called).toBe(true);
    });

    it('should not call onBufferChange when deleteLineToCursor no-ops at column 0 on the first line', () => {
      const buffer = new TextBuffer('hello');
      for (let i = 0; i < 5; i++) buffer.left();
      let called = false;
      buffer.onBufferChange = () => {
        called = true;
      };

      buffer.deleteLineToCursor();

      expect(called).toBe(false);
    });
  });
});
