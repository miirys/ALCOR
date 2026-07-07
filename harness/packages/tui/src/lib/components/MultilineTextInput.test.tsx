import { describe, it, expect, jest } from '@jest/globals';
import type { SendInputFn } from '../../test/input_helper';
import { renderWithProviders } from '../../test/render_helper';
import { TextBuffer } from '../text_buffer';
import { MultilineTextInput } from './MultilineTextInput';

interface RenderInputOptions {
  isKittyProtocolSupported?: boolean;
}

type MultilineTextInputProps = React.ComponentProps<typeof MultilineTextInput>;

function renderInput(
  props: Partial<MultilineTextInputProps> = {},
  options: RenderInputOptions = {},
) {
  const defaultProps: MultilineTextInputProps = {
    value: '',
    onChange: jest.fn(),
  };

  const mergedProps = { ...defaultProps, ...props };

  return renderWithProviders(<MultilineTextInput {...mergedProps} />, {
    envInfo: { isKittyProtocolSupported: options.isKittyProtocolSupported ?? false },
  });
}

// Cursor movement helpers
const moveCursorLeft = (sendInput: SendInputFn, count: number) => {
  for (let i = 0; i < count; i++) sendInput('', { leftArrow: true });
};

const sendString = (sendInput: SendInputFn, str: string) => {
  str.split('').forEach((char) => sendInput(char));
};

describe('MultilineTextInput', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('rendering', () => {
    it('should render empty input with placeholder', () => {
      const { lastFrame } = renderInput({ placeholder: 'Enter text here' });
      const output = lastFrame();

      expect(output).toContain('❯ ');
      expect(output).toContain('█'); // cursor
      expect(output).toContain('Enter text here');
    });

    it('should render without placeholder when not provided', () => {
      const { lastFrame } = renderInput();
      const output = lastFrame();

      expect(output).toContain('❯ ');
      expect(output).toContain('█'); // cursor
    });

    it('should render multiline text', () => {
      const { lastFrame } = renderInput({ value: 'Line 1\nLine 2\nLine 3' });
      const output = lastFrame();

      expect(output).toContain('Line 1');
      expect(output).toContain('Line 2');
      expect(output).toContain('Line 3');
    });

    it('should render masked text when masked prop is true', () => {
      const { lastFrame } = renderInput({ value: 'secret', masked: true });
      const output = lastFrame();

      expect(output).toContain('******'); // 6 asterisks for "secret"
      expect(output).not.toContain('secret');
    });

    it('should render normal text when masked prop is false', () => {
      const { lastFrame } = renderInput({ value: 'visible', masked: false });
      const output = lastFrame();

      expect(output).toContain('visible');
      expect(output).not.toContain('*******');
    });
  });

  describe('text input', () => {
    it('should call onChange when typing regular characters', () => {
      const onChange = jest.fn();
      const { sendInput } = renderInput({ onChange });

      sendInput('h');
      expect(onChange).toHaveBeenCalledWith('h');

      sendInput('e');
      expect(onChange).toHaveBeenCalledWith('he');

      sendInput('l');
      expect(onChange).toHaveBeenCalledWith('hel');
    });

    it('should handle special characters', () => {
      const onChange = jest.fn();
      const { sendInput } = renderInput({ onChange });

      sendInput('!');
      expect(onChange).toHaveBeenCalledWith('!');

      sendInput('@');
      expect(onChange).toHaveBeenCalledWith('!@');

      sendInput('#');
      expect(onChange).toHaveBeenCalledWith('!@#');
    });

    describe('when Shift+numeric keys are pressed', () => {
      describe('in standard terminal mode', () => {
        it('should insert the shifted character (e.g. ! for Shift+1)', () => {
          const onChange = jest.fn();
          // Standard terminals send the shifted character directly as a plain byte
          // e.g. Shift+1 → '!' (0x21), Shift+2 → '@' (0x40)
          const { sendInput } = renderInput({ onChange });

          sendInput('!');
          expect(onChange).toHaveBeenCalledWith('!');

          sendInput('@');
          expect(onChange).toHaveBeenCalledWith('!@');
        });
      });

      describe('in Kitty protocol mode', () => {
        it('should insert the shifted character (e.g. ! for Shift+1)', () => {
          const onChange = jest.fn();
          const { sendInput } = renderInput({ onChange }, { isKittyProtocolSupported: true });

          // Kitty protocol encodes Shift+1 as: ESC [ 49 ; 2 ; 33 u
          // key=49 ('1'), modifier=2 (shift), text-codepoint=33 ('!')
          // hex: 1b 5b 34 39 3b 32 3b 33 33 75
          sendInput('', {}, '1b5b34393b323b333375');
          expect(onChange).toHaveBeenCalledWith('!');
        });

        it('should insert the shifted character (e.g. @ for Shift+2)', () => {
          const onChange = jest.fn();
          const { sendInput } = renderInput({ onChange }, { isKittyProtocolSupported: true });

          // Kitty protocol encodes Shift+2 as: ESC [ 50 ; 2 ; 64 u
          // key=50 ('2'), modifier=2 (shift), text-codepoint=64 ('@')
          // hex: 1b 5b 35 30 3b 32 3b 36 34 75
          sendInput('', {}, '1b5b35303b323b363475');
          expect(onChange).toHaveBeenCalledWith('@');
        });
      });
    });

    it('should not call onChange when value has not changed', () => {
      const onChange = jest.fn();
      const { sendInput } = renderInput({ value: 'test', onChange });

      // Simulate a key that doesn't change the text (like arrow keys without actual movement)
      sendInput('', { leftArrow: true });

      // onChange should not be called if the text didn't actually change
      expect(onChange).not.toHaveBeenCalled();
    });
  });

  describe('keyboard navigation', () => {
    it.each([true, false])(
      'should handle backspace to delete characters (kitty=%s)',
      (isKittyProtocolSupported) => {
        const onChange = jest.fn();
        const { sendInput } = renderInput(
          { value: 'hello', onChange },
          { isKittyProtocolSupported },
        );

        sendInput('', { backspace: true });
        expect(onChange).toHaveBeenCalledWith('hell');

        sendInput('', { backspace: true });
        expect(onChange).toHaveBeenCalledWith('hel');
      },
    );

    it.each([true, false])('should handle delete key (kitty=%s)', (isKittyProtocolSupported) => {
      const onChange = jest.fn();
      const { sendInput } = renderInput({ value: 'hello', onChange }, { isKittyProtocolSupported });

      // Move cursor to beginning and delete
      moveCursorLeft(sendInput, 5);

      sendInput('', { delete: true });
      expect(onChange).toHaveBeenCalledWith('ello');
    });

    it('should handle arrow key navigation', () => {
      const onChange = jest.fn();
      const { sendInput } = renderInput({ value: 'hello', onChange });

      // Arrow keys should not trigger onChange by themselves
      sendInput('', { leftArrow: true });
      sendInput('', { rightArrow: true });
      sendInput('', { upArrow: true });
      sendInput('', { downArrow: true });

      expect(onChange).not.toHaveBeenCalled();
    });

    it('should handle multiline navigation with up/down arrows', () => {
      const onChange = jest.fn();
      const { sendInput } = renderInput({ value: 'line1\nline2\nline3', onChange });

      // Navigate up and down
      sendInput('', { upArrow: true });
      sendInput('', { upArrow: true });
      sendInput('', { downArrow: true });

      expect(onChange).not.toHaveBeenCalled();
    });

    describe('word navigation', () => {
      it('should handle Ctrl+Left to move to beginning of previous word', () => {
        const onChange = jest.fn();
        const { sendInput } = renderInput({ value: 'hello world', onChange });

        // Ctrl+Left should not trigger onChange by itself
        sendInput('', { leftArrow: true, ctrl: true });
        expect(onChange).not.toHaveBeenCalled();

        // Insert character after moving
        sendInput('x');
        expect(onChange).toHaveBeenCalledWith('hello xworld');
      });

      it('should handle Cmd+Left (meta) to move to beginning of previous word', () => {
        const onChange = jest.fn();
        const { sendInput } = renderInput({ value: 'hello world', onChange });

        // Cmd+Left should not trigger onChange by itself
        sendInput('', { leftArrow: true, meta: true });
        expect(onChange).not.toHaveBeenCalled();

        // Insert character after moving
        sendInput('x');
        expect(onChange).toHaveBeenCalledWith('hello xworld');
      });

      it('should handle Ctrl+Right to jump to beginning of next word', () => {
        const onChange = jest.fn();
        const { sendInput } = renderInput({ value: 'hello world', onChange });

        // Move to beginning first
        moveCursorLeft(sendInput, 11);

        // Ctrl+Right from beginning moves to beginning of next word
        sendInput('', { rightArrow: true, ctrl: true });
        expect(onChange).not.toHaveBeenCalled();

        // Insert character - should be at beginning of "world"
        sendInput('x');
        expect(onChange).toHaveBeenCalledWith('hello xworld');
      });

      it('should handle Cmd+Right (meta) to jump to beginning of next word', () => {
        const onChange = jest.fn();
        const { sendInput } = renderInput({ value: 'hello world', onChange });

        // Move to beginning first
        moveCursorLeft(sendInput, 11);

        // Cmd+Right from beginning moves to beginning of next word
        sendInput('', { rightArrow: true, meta: true });
        expect(onChange).not.toHaveBeenCalled();

        // Insert character - should be at beginning of "world"
        sendInput('x');
        expect(onChange).toHaveBeenCalledWith('hello xworld');
      });

      it('should handle Meta+b (WezTerm/macOS Option+Left) for backward word navigation', () => {
        const onChange = jest.fn();
        const { sendInput } = renderInput({ value: 'hello world', onChange });

        // Meta+b (hex 1b62) is sent by WezTerm for Option+Left on macOS
        // This should move cursor to beginning of previous word
        sendInput('b', { leftArrow: true, meta: true }, '1b62');
        expect(onChange).not.toHaveBeenCalled();

        // Insert character after moving
        sendInput('x');
        expect(onChange).toHaveBeenCalledWith('hello xworld');
      });

      it('should handle Meta+f (WezTerm/macOS Option+Right) for forward word navigation', () => {
        const onChange = jest.fn();
        const { sendInput } = renderInput({ value: 'hello world', onChange });

        // Move to beginning first
        moveCursorLeft(sendInput, 11);

        // Meta+f (hex 1b66) is sent by WezTerm for Option+Right on macOS
        // This should move cursor to beginning of next word
        sendInput('f', { rightArrow: true, meta: true }, '1b66');
        expect(onChange).not.toHaveBeenCalled();

        // Insert character - should be at beginning of "world"
        sendInput('x');
        expect(onChange).toHaveBeenCalledWith('hello xworld');
      });

      it('should handle multiple word jumps with Ctrl+Left', () => {
        const onChange = jest.fn();
        const { sendInput } = renderInput({ value: 'one two three four', onChange });

        // Jump back multiple words
        sendInput('', { leftArrow: true, ctrl: true });
        sendInput('', { leftArrow: true, ctrl: true });

        // Insert character
        sendInput('x');
        expect(onChange).toHaveBeenCalledWith('one two xthree four');
      });

      it('should handle multiple word jumps with Ctrl+Right', () => {
        const onChange = jest.fn();
        const { sendInput } = renderInput({ value: 'one two three four', onChange });

        // Move to beginning
        moveCursorLeft(sendInput, 18);

        // Jump forward multiple words (from beginning of words)
        sendInput('', { rightArrow: true, ctrl: true });
        sendInput('', { rightArrow: true, ctrl: true });

        // Insert character - should be at beginning of "three"
        sendInput('x');
        expect(onChange).toHaveBeenCalledWith('one two xthree four');
      });
    });

    describe('home/end navigation', () => {
      it('should handle Ctrl+A to move to beginning of line', () => {
        const onChange = jest.fn();
        const { sendInput } = renderInput({ value: 'hello world', onChange });

        // Ctrl+A should not trigger onChange by itself
        sendInput('a', { ctrl: true });
        expect(onChange).not.toHaveBeenCalled();

        // Insert character after moving to beginning
        sendInput('x');
        expect(onChange).toHaveBeenCalledWith('xhello world');
      });

      it('should handle Ctrl+E to move to end of line', () => {
        const onChange = jest.fn();
        const { sendInput } = renderInput({ value: 'hello world', onChange });

        // Move to beginning first
        moveCursorLeft(sendInput, 11);

        // Ctrl+E should not trigger onChange by itself
        sendInput('e', { ctrl: true });
        expect(onChange).not.toHaveBeenCalled();

        // Insert character after moving to end
        sendInput('x');
        expect(onChange).toHaveBeenCalledWith('hello worldx');
      });

      it('should handle Ctrl+A on multiline text', () => {
        const onChange = jest.fn();
        const { sendInput } = renderInput({ value: 'line1\nline2\nline3', onChange });

        // Ctrl+A moves cursor to beginning of line
        sendInput('a', { ctrl: true });
        expect(onChange).not.toHaveBeenCalled();

        // Insert character - verifies Ctrl+A didn't crash
        sendInput('x');
        expect(onChange).toHaveBeenCalled();
        expect(onChange).toHaveBeenCalledWith(expect.stringContaining('x'));
      });

      it('should handle Ctrl+E on multiline text', () => {
        const onChange = jest.fn();
        const { sendInput } = renderInput({ value: 'line1\nline2\nline3', onChange });

        // Move to second line
        sendInput('', { upArrow: true });

        // Move to beginning of line2
        sendInput('a', { ctrl: true });

        // Ctrl+E moves to end of line
        sendInput('e', { ctrl: true });
        expect(onChange).not.toHaveBeenCalled();

        // Insert character - verifies Ctrl+E didn't crash
        sendInput('x');
        expect(onChange).toHaveBeenCalled();
        expect(onChange).toHaveBeenCalledWith(expect.stringContaining('x'));
      });
    });
  });

  describe('CTRL+U (deleteLineToCursor)', () => {
    it('should delete from cursor to the start of the current line', () => {
      const onChange = jest.fn();
      const { sendInput } = renderInput({ value: 'hello world', onChange });

      // Move cursor to after 'hello ' (5 chars from end = position 6)
      moveCursorLeft(sendInput, 5);

      sendInput('u', { ctrl: true });
      expect(onChange).toHaveBeenCalledWith('world');
    });

    it('should clear the entire line when cursor is at the end', () => {
      const onChange = jest.fn();
      const { sendInput } = renderInput({ value: 'hello', onChange });

      sendInput('u', { ctrl: true });
      expect(onChange).toHaveBeenCalledWith('');
    });

    it('should only clear the current line in a multiline buffer', () => {
      const onChange = jest.fn();
      const { sendInput } = renderInput({ value: 'first\nsecond\nthird', onChange });

      // Navigate to 'second' line then jump to its end (Ctrl+E) before CTRL+U
      sendInput('', { upArrow: true });
      sendInput('e', { ctrl: true });
      sendInput('u', { ctrl: true });

      expect(onChange).toHaveBeenCalledWith('first\n\nthird');
    });
  });

  describe('multiline functionality', () => {
    it('should insert newline with Shift+Enter', () => {
      const onChange = jest.fn();
      const { sendInput } = renderInput({ value: 'first line', onChange });

      sendInput('', { return: true, shift: true });
      expect(onChange).toHaveBeenCalledWith('first line\n');
    });

    it('should insert newline with Ctrl+J', () => {
      const onChange = jest.fn();
      const { sendInput } = renderInput({ value: 'first line', onChange });

      sendInput('j', { ctrl: true });
      expect(onChange).toHaveBeenCalledWith('first line\n');
    });

    it('should not insert newline with Enter alone', () => {
      const onChange = jest.fn();
      const { sendInput } = renderInput({ value: 'test', onChange });

      sendInput('', { return: true });
      expect(onChange).not.toHaveBeenCalled();
    });

    it('should handle text insertion in multiline content', () => {
      const onChange = jest.fn();
      const { sendInput } = renderInput({ value: 'line1\nline2', onChange });

      sendInput('x');
      expect(onChange).toHaveBeenCalledWith('line1\nline2x');
    });
  });

  describe('cursor positioning', () => {
    it('should handle cursor movement with left/right arrows', () => {
      const onChange = jest.fn();
      const { sendInput } = renderInput({ value: 'hello', onChange });

      // Move left and insert character
      sendInput('', { leftArrow: true });
      sendInput('x');
      expect(onChange).toHaveBeenCalledWith('hellxo');
    });
  });

  describe('edge cases', () => {
    it('should handle value with only newlines', () => {
      const { lastFrame } = renderInput({ value: '\n\n\n' });
      const output = lastFrame();

      // The component renders with a prompt character on each line
      expect(output).toContain('❯');
    });

    it('should handle ctrl and meta key combinations without inserting text', () => {
      const onChange = jest.fn();
      const { sendInput } = renderInput({ onChange });

      sendInput('c', { ctrl: true });
      sendInput('v', { ctrl: true });
      sendInput('a', { meta: true });

      expect(onChange).not.toHaveBeenCalled();
    });

    it('should handle masked multiline text', () => {
      const { lastFrame } = renderInput({
        value: 'secret1\nsecret2\nsecret3',
        masked: true,
      });
      const output = lastFrame();

      expect(output).toContain('*******'); // 7 asterisks for "secret1"
      expect(output).toContain('*******'); // 7 asterisks for "secret2"
      expect(output).toContain('*******'); // 7 asterisks for "secret3"
      expect(output).not.toContain('secret');
    });
  });

  describe('integration with TextBuffer', () => {
    it('should sync with external value changes', () => {
      const onChange = jest.fn();
      const { lastFrame, rerender } = renderInput({ value: 'initial', onChange });

      // Change value externally
      rerender(<MultilineTextInput value="updated" onChange={onChange} />);

      const output = lastFrame();
      expect(output).toContain('updated');
    });

    it('should maintain cursor position when value changes externally', () => {
      const onChange = jest.fn();
      const { sendInput, rerender } = renderInput({ value: 'hello world', onChange });

      // Move cursor to middle
      moveCursorLeft(sendInput, 3);

      // Change value externally to longer text
      rerender(<MultilineTextInput value="hello beautiful world" onChange={onChange} />);

      // Insert character - should be at the end due to setText behavior
      sendInput('!');
      expect(onChange).toHaveBeenCalledWith('hello beautiful world!');
    });

    it('should use provided initialTextBuffer', () => {
      const customBuffer = new TextBuffer('custom initial');
      const { lastFrame } = renderInput({
        value: 'custom initial',
        initialTextBuffer: customBuffer,
      });

      const output = lastFrame();
      expect(output).toContain('custom initial');
    });
  });

  describe('ignoreKeys', () => {
    it('should ignore specified keys', () => {
      const onChange = jest.fn();
      const { sendInput } = renderInput({ onChange, ignoreKeys: ['up', 'down'] });

      // Type some text first
      sendString(sendInput, 'line1');
      sendInput('', { return: true, shift: true });
      sendString(sendInput, 'line2');

      onChange.mockClear();

      // Try to use up/down arrows - should be ignored
      sendInput('', { upArrow: true });
      sendInput('', { downArrow: true });

      expect(onChange).not.toHaveBeenCalled();
    });

    it('should allow up/down arrows when not in ignoreKeys', () => {
      const onChange = jest.fn();
      const { sendInput } = renderInput({ onChange, value: 'line1\nline2' });

      // Navigate up - should work
      sendInput('', { upArrow: true });

      // Insert character to verify cursor moved
      sendInput('x');
      expect(onChange).toHaveBeenCalledWith('line1x\nline2');
    });

    it('should still allow other keys when some keys are ignored', () => {
      const onChange = jest.fn();
      const { sendInput } = renderInput({ onChange, ignoreKeys: ['up', 'down'] });

      // Left/right arrows should still work
      sendString(sendInput, 'hello');
      sendInput('', { leftArrow: true });
      sendInput('x');

      expect(onChange).toHaveBeenCalledWith('hellxo');
    });
  });

  describe('additional edge cases', () => {
    it('should handle empty string value', () => {
      const { lastFrame } = renderInput();
      const output = lastFrame();

      expect(output).toContain('❯ ');
      expect(output).toContain('█');
    });

    it('should handle very long single line', () => {
      const longText = 'a'.repeat(1000);
      const { lastFrame } = renderInput({ value: longText });
      const output = lastFrame();

      expect(output).toContain('aaa');
    });

    it('should handle many lines with viewport windowing', () => {
      const manyLines = Array.from({ length: 100 }, (_, i) => `line ${i}`).join('\n');
      const { lastFrame } = renderInput({ value: manyLines });
      const output = lastFrame();

      expect(output).toContain('line 99');
      expect(output).not.toContain('line 0');
    });

    it('should handle rapid text input', () => {
      const onChange = jest.fn();
      const { sendInput } = renderInput({ onChange });

      // Simulate rapid typing
      sendString(sendInput, 'hello world');

      expect(onChange).toHaveBeenLastCalledWith('hello world');
    });

    it('should handle mixed operations', () => {
      const onChange = jest.fn();
      const { sendInput } = renderInput({ value: 'test', onChange });

      sendString(sendInput, 'ing');
      sendInput('', { leftArrow: true });
      sendInput('', { leftArrow: true });
      sendInput('', { backspace: true });
      sendInput('x');

      expect(onChange).toHaveBeenLastCalledWith('testxng');
    });

    it('should not trigger onChange for navigation-only keys when at boundaries', () => {
      const onChange = jest.fn();
      const { sendInput } = renderInput({ value: 'test', onChange });

      // Try to move right at end of line
      sendInput('', { rightArrow: true });
      // Try to move down at last line
      sendInput('', { downArrow: true });

      expect(onChange).not.toHaveBeenCalled();
    });

    it('should handle cursor at different positions in masked text', () => {
      const { sendInput, lastFrame } = renderInput({ value: 'secret', masked: true });

      sendInput('', { leftArrow: true });
      sendInput('', { leftArrow: true });

      const output = lastFrame();
      expect(output).toContain('*');
      expect(output).not.toContain('secret');
    });

    it('should handle placeholder with masked input', () => {
      const { lastFrame } = renderInput({
        placeholder: 'Enter password',
        masked: true,
      });
      const output = lastFrame();

      expect(output).toContain('Enter password');
    });
  });

  describe('viewport scrolling', () => {
    it('shows all lines when content fits within maxVisibleLines', () => {
      const { lastFrame } = renderInput({
        value: 'line 0\nline 1\nline 2',
        maxVisibleLines: 5,
      });
      const output = lastFrame();

      expect(output).toContain('line 0');
      expect(output).toContain('line 1');
      expect(output).toContain('line 2');
      expect(output).not.toContain('▲');
      expect(output).not.toContain('▼');
    });

    it('shows only the visible window when content exceeds maxVisibleLines', () => {
      const lines = Array.from({ length: 20 }, (_, i) => `line ${i}`).join('\n');
      const { lastFrame } = renderInput({ value: lines, maxVisibleLines: 5 });
      const output = lastFrame();

      expect(output).toContain('line 19');
      expect(output).not.toContain('line 0');
    });

    it('keeps cursor line within visible window', () => {
      const value = Array.from({ length: 20 }, (_, i) => `line ${i}`).join('\n');
      const buffer = new TextBuffer(value);
      for (let i = 0; i < 19; i++) buffer.up();

      const { lastFrame } = renderInput({
        value,
        maxVisibleLines: 5,
        initialTextBuffer: buffer,
      });
      const output = lastFrame();

      expect(output).toContain('line 0');
    });

    describe('when navigating up past the visible window', () => {
      it('scrolls the window to follow the cursor', () => {
        const value = Array.from({ length: 10 }, (_, i) => `line ${i}`).join('\n');
        const buffer = new TextBuffer(value);
        for (let i = 0; i < 9; i++) buffer.up();

        const { lastFrame } = renderInput({
          value,
          maxVisibleLines: 3,
          initialTextBuffer: buffer,
        });
        const output = lastFrame();

        expect(output).toContain('line 0');
        expect(output).not.toContain('line 9');
      });
    });

    describe('when navigating down past the visible window', () => {
      it('scrolls the window to follow the cursor', () => {
        const value = Array.from({ length: 10 }, (_, i) => `line ${i}`).join('\n');
        const { lastFrame, sendInput } = renderInput({ value, maxVisibleLines: 3 });

        sendInput('', { upArrow: true });
        sendInput('', { downArrow: true });
        const output = lastFrame();

        expect(output).toContain('line 9');
        expect(output).not.toContain('line 0');
      });
    });

    describe('when content is above the viewport', () => {
      it('shows the ▲ scroll indicator', () => {
        const value = Array.from({ length: 10 }, (_, i) => `line ${i}`).join('\n');
        const { lastFrame } = renderInput({ value, maxVisibleLines: 3 });
        const output = lastFrame();

        expect(output).toContain('▲');
      });
    });

    describe('when content is below the viewport', () => {
      it('shows the ▼ scroll indicator', () => {
        const value = Array.from({ length: 10 }, (_, i) => `line ${i}`).join('\n');
        const buffer = new TextBuffer(value);
        for (let i = 0; i < 9; i++) buffer.up();

        const { lastFrame } = renderInput({
          value,
          maxVisibleLines: 3,
          initialTextBuffer: buffer,
        });
        const output = lastFrame();

        expect(output).toContain('▼');
      });
    });

    it('respects explicit maxVisibleLines prop over default', () => {
      const lines = Array.from({ length: 50 }, (_, i) => `line ${i}`).join('\n');
      const { lastFrame } = renderInput({ value: lines, maxVisibleLines: 2 });
      const output = lastFrame();

      expect(output).toContain('line 49');
      expect(output).toContain('line 48');
      expect(output).not.toContain('line 47');
    });

    describe('when a line wraps due to prompt prefix width', () => {
      it('accounts for the prefix in row measurement', () => {
        // ink-testing-library uses 100 columns
        // 99 chars + 2 char prefix = 101 effective chars → wraps to 2 rows in 100-col terminal
        const longLine = 'x'.repeat(99);
        const value = `${longLine}\nsecond line`;
        const buffer = new TextBuffer(value);
        // Move cursor to first line
        buffer.up();

        const { lastFrame } = renderInput({
          value,
          maxVisibleLines: 2,
          initialTextBuffer: buffer,
        });
        const output = lastFrame();

        // The long line (2 rows with prefix) fills the budget — second line should be hidden
        expect(output).toContain(longLine);
        expect(output).not.toContain('second line');
        expect(output).toContain('▼');
      });
    });
  });
});
