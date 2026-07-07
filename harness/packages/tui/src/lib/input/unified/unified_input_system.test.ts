/**
 * Integration tests for UnifiedInputSystem
 *
 * Tests the full flow:
 * 1. System is configured for Kitty or standard protocol
 * 2. Raw bytes are sent to processRawInput()
 * 3. Correct ParsedKey is emitted
 */

import { UnifiedInputSystem } from './unified_input_system';
import type { ParsedKey } from './types';

/**
 * Default ParsedKey properties - modifiers default to false
 */
const defaultKey = {
  ctrl: false,
  meta: false,
  shift: false,
  option: false,
  number: false,
  eventType: 'press' as const,
  timestamp: expect.any(Number),
};

describe('UnifiedInputSystem', () => {
  describe('Standard Terminal (non-Kitty)', () => {
    let system: UnifiedInputSystem;
    let receivedKey: ParsedKey | null;

    beforeEach(() => {
      system = new UnifiedInputSystem();
      system.setKittyProtocol(false);
      receivedKey = null;
      system.onKey((key) => {
        receivedKey = key;
      });
    });

    afterEach(() => {
      system.dispose();
    });

    /* The following key's are not provided by Terminal.app as expected
      ${'Alt+Left Arrow'}    | ${[27, 98]}             | ${{ name: 'left', meta: true }}
      ${'Alt+Right Arrow'}   | ${[27, 102]}            | ${{ name: 'right', meta: true }}
      ${'Meta+B'}            | ${[226, 136, 171]}      | ${{ name: 'left', meta: true }}
      ${'Meta+F'}            | ${[198, 146]}           | ${{ name: 'right', meta: true }}
      ${'Ctrl+Backspace'}    | ${[127]}                | ${{ name: 'backspace', ctrl: true }}
      ${'Alt+Backspace'}     | ${[127]}                | ${{ name: 'backspace', meta: true }}
      ${'Shift+Enter'}       | ${[13]}                 | ${{ name: 'return', shift: true }}
    */
    /** run  bun run --filter @gitlab-org/tui dump-input in kitty-incompatible terminal to scan your byte sequence */
    it.each`
      keyboardInputName     | bytes                        | expectedParsedKey
      ${'Enter'}            | ${[13]}                      | ${{ name: 'return' }}
      ${'ESC+Enter'}        | ${[27, 13]}                  | ${{ name: 'return', shift: true }}
      ${'Escape'}           | ${[27]}                      | ${{ name: 'escape' }}
      ${'Tab'}              | ${[9]}                       | ${{ name: 'tab' }}
      ${'Shift+Tab'}        | ${[27, 91, 90]}              | ${{ name: 'tab', shift: true }}
      ${'Backspace'}        | ${[127]}                     | ${{ name: 'backspace' }}
      ${'Delete'}           | ${[27, 91, 51, 126]}         | ${{ name: 'delete' }}
      ${'Left Arrow'}       | ${[27, 91, 68]}              | ${{ name: 'left' }}
      ${'Right Arrow'}      | ${[27, 91, 67]}              | ${{ name: 'right' }}
      ${'Up Arrow'}         | ${[27, 91, 65]}              | ${{ name: 'up' }}
      ${'Down Arrow'}       | ${[27, 91, 66]}              | ${{ name: 'down' }}
      ${'Ctrl+A'}           | ${[1]}                       | ${{ name: 'a', ctrl: true }}
      ${'Ctrl+C'}           | ${[3]}                       | ${{ name: 'c', ctrl: true }}
      ${'Ctrl+D'}           | ${[4]}                       | ${{ name: 'd', ctrl: true }}
      ${'Ctrl+E'}           | ${[5]}                       | ${{ name: 'e', ctrl: true }}
      ${'Ctrl+J'}           | ${[10]}                      | ${{ name: 'linefeed' }}
      ${'Ctrl+O'}           | ${[15]}                      | ${{ name: 'o', ctrl: true }}
      ${'Ctrl+R'}           | ${[18]}                      | ${{ name: 'r', ctrl: true }}
      ${'Ctrl+S'}           | ${[19]}                      | ${{ name: 's', ctrl: true }}
      ${'Ctrl+Left Arrow'}  | ${[27, 91, 49, 59, 53, 68]}  | ${{ name: 'left', ctrl: true }}
      ${'Ctrl+Right Arrow'} | ${[27, 91, 49, 59, 53, 67]}  | ${{ name: 'right', ctrl: true }}
      ${'Ctrl+Delete'}      | ${[27, 91, 51, 59, 53, 126]} | ${{ name: 'delete', ctrl: true }}
      ${'a'}                | ${[97]}                      | ${{ name: 'a' }}
      ${'Shift+A'}          | ${[65]}                      | ${{ name: 'A' }}
      ${'5'}                | ${[53]}                      | ${{ name: '5', number: true }}
    `('parses $keyboardInputName', ({ bytes, expectedParsedKey }) => {
      const buffer = Buffer.from(bytes);
      system.processRawInput(buffer);

      const expected = { ...defaultKey, source: 'raw', ...expectedParsedKey };
      expect(receivedKey).toEqual(expect.objectContaining(expected));

      // Reset for next test in the table
      receivedKey = null;
    });
  });

  describe('Kitty Protocol', () => {
    let system: UnifiedInputSystem;
    let receivedKey: ParsedKey | null;

    beforeEach(() => {
      system = new UnifiedInputSystem();
      system.setKittyProtocol(true);
      receivedKey = null;
      system.onKey((key) => {
        receivedKey = key;
      });
    });

    afterEach(() => {
      system.dispose();
    });

    /* The following key's are not provided by Ghostty as expected
    ${'Meta+B'}            | ${[226, 136, 171]}               | ${{ name: 'left', meta: true }}
    ${'Meta+F'}            | ${[198, 146]}                    | ${{ name: 'right', meta: true }}
    ${'Alt+Backspace'}     | ${[127]}                         | ${{ name: 'backspace', meta: true }}
    */
    /** run  bun run --filter @gitlab-org/tui dump-input:kitty in kitty-compatible terminal to scan your byte sequence */
    it.each`
      keyboardInputName      | bytes                                | expectedParsedKey
      ${'Enter'}             | ${[13]}                              | ${{ name: 'return' }}
      ${'Escape'}            | ${[27, 91, 50, 55, 117]}             | ${{ name: 'escape' }}
      ${'Tab'}               | ${[9]}                               | ${{ name: 'tab' }}
      ${'Shift+Tab'}         | ${[27, 91, 57, 59, 50, 117]}         | ${{ name: 'tab', shift: true }}
      ${'Backspace'}         | ${[127]}                             | ${{ name: 'backspace' }}
      ${'Delete'}            | ${[27, 91, 51, 126]}                 | ${{ name: 'delete' }}
      ${'Left Arrow'}        | ${[27, 91, 68]}                      | ${{ name: 'left' }}
      ${'Right Arrow'}       | ${[27, 91, 67]}                      | ${{ name: 'right' }}
      ${'Up Arrow'}          | ${[27, 91, 65]}                      | ${{ name: 'up' }}
      ${'Down Arrow'}        | ${[27, 91, 66]}                      | ${{ name: 'down' }}
      ${'Home'}              | ${[27, 91, 72]}                      | ${{ name: 'home' }}
      ${'End'}               | ${[27, 91, 70]}                      | ${{ name: 'end' }}
      ${'Ctrl+A'}            | ${[27, 91, 57, 55, 59, 53, 117]}     | ${{ name: 'a', ctrl: true }}
      ${'Ctrl+C'}            | ${[27, 91, 57, 57, 59, 53, 117]}     | ${{ name: 'c', ctrl: true }}
      ${'Ctrl+D'}            | ${[27, 91, 49, 48, 48, 59, 53, 117]} | ${{ name: 'd', ctrl: true }}
      ${'Ctrl+E'}            | ${[27, 91, 49, 48, 49, 59, 53, 117]} | ${{ name: 'e', ctrl: true }}
      ${'Ctrl+J'}            | ${[27, 91, 49, 48, 54, 59, 53, 117]} | ${{ name: 'j', ctrl: true }}
      ${'Ctrl+O'}            | ${[27, 91, 49, 49, 49, 59, 53, 117]} | ${{ name: 'o', ctrl: true }}
      ${'Ctrl+R'}            | ${[27, 91, 49, 49, 52, 59, 53, 117]} | ${{ name: 'r', ctrl: true }}
      ${'Ctrl+S'}            | ${[27, 91, 49, 49, 53, 59, 53, 117]} | ${{ name: 's', ctrl: true }}
      ${'Ctrl+Left Arrow'}   | ${[27, 91, 49, 59, 53, 68]}          | ${{ name: 'left', ctrl: true }}
      ${'Ctrl+Right Arrow'}  | ${[27, 91, 49, 59, 53, 67]}          | ${{ name: 'right', ctrl: true }}
      ${'Alt+Left Arrow'}    | ${[27, 98]}                          | ${{ name: 'left', meta: true, option: true }}
      ${'Alt+Right Arrow'}   | ${[27, 102]}                         | ${{ name: 'right', meta: true, option: true }}
      ${'Ctrl+Backspace'}    | ${[27, 91, 49, 50, 55, 59, 53, 117]} | ${{ name: 'backspace', ctrl: true }}
      ${'Ctrl+Delete'}       | ${[27, 91, 51, 59, 53, 126]}         | ${{ name: 'delete', ctrl: true }}
      ${'Alt+Delete'}        | ${[27, 91, 51, 59, 51, 126]}         | ${{ name: 'delete', meta: true, option: true }}
      ${'Shift+Enter'}       | ${[27, 91, 49, 51, 59, 50, 117]}     | ${{ name: 'return', shift: true }}
      ${'a'}                 | ${[97]}                              | ${{ name: 'a' }}
      ${'Shift+A'}           | ${[65]}                              | ${{ name: 'A' }}
      ${'5'}                 | ${[53]}                              | ${{ name: '5', number: true }}
      ${'Ctrl+C (raw byte)'} | ${[3]}                               | ${{ name: 'c', ctrl: true }}
      ${'Ctrl+A (raw byte)'} | ${[1]}                               | ${{ name: 'a', ctrl: true }}
    `('parses $keyboardInputName', ({ bytes, expectedParsedKey }) => {
      const buffer = Buffer.from(bytes);
      system.processRawInput(buffer);

      const expected = { ...defaultKey, source: 'kitty', ...expectedParsedKey };
      expect(receivedKey).toEqual(expect.objectContaining(expected));

      // Reset for next test in the table
      receivedKey = null;
    });

    describe('when buffer contains multiple keys', () => {
      let receivedKeys: ParsedKey[];

      beforeEach(() => {
        receivedKeys = [];
        system.onKey((key) => {
          receivedKeys.push(key);
        });
      });

      describe('when a plain character is followed by a Kitty escape sequence', () => {
        beforeEach(() => {
          // 'n' press (0x6e) followed by 'n' release (\x1b[110;1:3u)
          const buffer = Buffer.from([
            0x6e, 0x1b, 0x5b, 0x31, 0x31, 0x30, 0x3b, 0x31, 0x3a, 0x33, 0x75,
          ]);
          system.processRawInput(buffer);
        });

        it('emits both keys in order', () => {
          expect(receivedKeys).toHaveLength(2);
          expect(receivedKeys[0]).toEqual(
            expect.objectContaining({
              ...defaultKey,
              name: 'n',
              source: 'kitty',
            }),
          );
          expect(receivedKeys[1]).toEqual(
            expect.objectContaining({
              ...defaultKey,
              name: 'n',
              source: 'kitty',
              eventType: 'release',
            }),
          );
        });
      });

      describe('when multiple Kitty escape sequences are concatenated', () => {
        beforeEach(() => {
          // 'f' release (\x1b[102;1:3u) + 'o' press (0x6f) + 'o' release (\x1b[111;1:3u)
          const fRelease = [0x1b, 0x5b, 0x31, 0x30, 0x32, 0x3b, 0x31, 0x3a, 0x33, 0x75];
          const oPress = [0x6f];
          const oRelease = [0x1b, 0x5b, 0x31, 0x31, 0x31, 0x3b, 0x31, 0x3a, 0x33, 0x75];
          const buffer = Buffer.from([...fRelease, ...oPress, ...oRelease]);
          system.processRawInput(buffer);
        });

        it('emits all three keys in order', () => {
          expect(receivedKeys).toHaveLength(3);
          expect(receivedKeys[0]).toEqual(
            expect.objectContaining({
              ...defaultKey,
              name: 'f',
              source: 'kitty',
              eventType: 'release',
            }),
          );
          expect(receivedKeys[1]).toEqual(
            expect.objectContaining({
              ...defaultKey,
              name: 'o',
              source: 'kitty',
            }),
          );
          expect(receivedKeys[2]).toEqual(
            expect.objectContaining({
              ...defaultKey,
              name: 'o',
              source: 'kitty',
              eventType: 'release',
            }),
          );
        });
      });

      describe('when buffer contains a single key', () => {
        beforeEach(() => {
          const buffer = Buffer.from([97]);
          system.processRawInput(buffer);
        });

        it('emits exactly one key', () => {
          expect(receivedKeys).toHaveLength(1);
          expect(receivedKeys[0]).toEqual(
            expect.objectContaining({
              ...defaultKey,
              name: 'a',
              source: 'kitty',
            }),
          );
        });
      });
    });
  });

  describe('Paste handling', () => {
    let system: UnifiedInputSystem;
    let receivedKey: ParsedKey | null;

    beforeEach(() => {
      system = new UnifiedInputSystem();
      receivedKey = null;
      system.onKey((key) => {
        receivedKey = key;
      });
    });

    afterEach(() => {
      system.dispose();
    });

    it('handles single-chunk paste (standard terminal)', () => {
      system.setKittyProtocol(false);

      // Bracketed paste: ESC[200~ ... ESC[201~
      const pasteContent = 'Hello, World!';
      const pasteSequence = `\x1b[200~${pasteContent}\x1b[201~`;
      const buffer = Buffer.from(pasteSequence);

      system.processRawInput(buffer);

      expect(receivedKey).not.toBeNull();
      expect(receivedKey?.name).toBe('paste');
      expect(receivedKey?.sequence).toBe(pasteContent);
      expect(receivedKey?.source).toBe('raw');
    });

    it('handles single-chunk paste (Kitty protocol)', () => {
      system.setKittyProtocol(true);

      const pasteContent = 'Hello, World!';
      const pasteSequence = `\x1b[200~${pasteContent}\x1b[201~`;
      const buffer = Buffer.from(pasteSequence);

      system.processRawInput(buffer);

      expect(receivedKey).not.toBeNull();
      expect(receivedKey?.name).toBe('paste');
      expect(receivedKey?.sequence).toBe(pasteContent);
      expect(receivedKey?.source).toBe('kitty');
    });

    it('handles multi-chunk paste', () => {
      system.setKittyProtocol(false);

      // First chunk: start marker + partial content
      system.processRawInput(Buffer.from('\x1b[200~Hello, '));
      expect(receivedKey).toBeNull(); // Not emitted yet

      // Second chunk: more content
      system.processRawInput(Buffer.from('World'));
      expect(receivedKey).toBeNull(); // Still buffering

      // Third chunk: rest + end marker
      system.processRawInput(Buffer.from('!\x1b[201~'));

      expect(receivedKey).not.toBeNull();
      expect(receivedKey?.name).toBe('paste');
      expect(receivedKey?.sequence).toBe('Hello, World!');
    });

    it('normalizes newlines in paste', () => {
      system.setKittyProtocol(false);

      const pasteSequence = `\x1b[200~line1\r\nline2\rline3\nline4\x1b[201~`;
      system.processRawInput(Buffer.from(pasteSequence));

      expect(receivedKey?.name).toBe('paste');
      expect(receivedKey?.sequence).toBe('line1\nline2\nline3\nline4');
    });

    it('handles paste via processPasteEvent directly', () => {
      system.setKittyProtocol(false);

      system.processPasteEvent('Direct paste');

      expect(receivedKey?.name).toBe('paste');
      expect(receivedKey?.sequence).toBe('Direct paste');
    });
  });

  describe('Focus reporting (DEC 1004)', () => {
    it('starts focused', () => {
      expect(new UnifiedInputSystem().isFocused).toBe(true);
    });

    it('emits focus-out and focus-in on the focus channel, not as keys', () => {
      const system = new UnifiedInputSystem();
      const focusChanges: boolean[] = [];
      const keys: ParsedKey[] = [];
      system.onFocusChange((focused) => focusChanges.push(focused));
      system.onKey((key) => keys.push(key));

      system.processRawInput(Buffer.from('\x1b[O')); // focus out
      system.processRawInput(Buffer.from('\x1b[I')); // focus in

      expect(focusChanges).toEqual([false, true]);
      expect(system.isFocused).toBe(true);
      expect(keys).toHaveLength(0);
    });

    it('only fires when the focus state actually changes', () => {
      const system = new UnifiedInputSystem();
      const focusChanges: boolean[] = [];
      system.onFocusChange((focused) => focusChanges.push(focused));

      system.processRawInput(Buffer.from('\x1b[I')); // already focused → no event
      system.processRawInput(Buffer.from('\x1b[O'));
      system.processRawInput(Buffer.from('\x1b[O')); // already unfocused → no second event

      expect(focusChanges).toEqual([false]);
    });

    it('processFocusEvent updates state directly', () => {
      const system = new UnifiedInputSystem();
      system.processFocusEvent(false);
      expect(system.isFocused).toBe(false);
    });
  });

  describe('Ctrl+Z (suspend)', () => {
    let system: UnifiedInputSystem;
    let suspendCount: number;
    let keys: ParsedKey[];

    beforeEach(() => {
      system = new UnifiedInputSystem();
      suspendCount = 0;
      keys = [];
      system.onSuspend(() => {
        suspendCount += 1;
      });
      system.onKey((key) => keys.push(key));
    });

    afterEach(() => {
      system.dispose();
    });

    it('fires suspend, not a key, on the raw Ctrl+Z byte (standard terminal)', () => {
      system.setKittyProtocol(false);

      system.processRawInput(Buffer.from([26]));

      expect(suspendCount).toBe(1);
      expect(keys).toHaveLength(0);
    });

    it('fires suspend, not a key, on the raw Ctrl+Z byte (Kitty protocol)', () => {
      system.setKittyProtocol(true);

      system.processRawInput(Buffer.from([26]));

      expect(suspendCount).toBe(1);
      expect(keys).toHaveLength(0);
    });

    it('fires suspend on the Kitty Ctrl+Z escape sequence', () => {
      system.setKittyProtocol(true);

      // CSI 122 ; 5 u — unicode 'z' (122) with the ctrl modifier (4 + 1).
      system.processRawInput(Buffer.from('\x1b[122;5u'));

      expect(suspendCount).toBe(1);
      expect(keys).toHaveLength(0);
    });

    it('does not suspend on a Ctrl+Z release event', () => {
      system.setKittyProtocol(true);

      // CSI 122 ; 5 : 3 u — ctrl+z release.
      system.processRawInput(Buffer.from('\x1b[122;5:3u'));

      expect(suspendCount).toBe(0);
    });

    it('does not suspend on a Ctrl+Z auto-repeat event', () => {
      system.setKittyProtocol(true);

      // CSI 122 ; 5 : 2 u — ctrl+z repeat (held key).
      system.processRawInput(Buffer.from('\x1b[122;5:2u'));

      expect(suspendCount).toBe(0);
    });

    it('does not suspend on other ctrl keys', () => {
      system.setKittyProtocol(false);

      system.processRawInput(Buffer.from([1])); // Ctrl+A

      expect(suspendCount).toBe(0);
      expect(keys).toHaveLength(1);
      expect(keys[0]).toEqual(expect.objectContaining({ name: 'a', ctrl: true }));
    });
  });
});
