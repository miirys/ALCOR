import { Key } from './key';

describe('Key', () => {
  describe('parse', () => {
    const parseKey = (bytes: Uint8Array | string) => {
      const byteArray = typeof bytes === 'string' ? new TextEncoder().encode(bytes) : bytes;
      return Key.parse(byteArray);
    };

    const expectKeyName = (bytes: Uint8Array | string, name: string) => {
      const result = parseKey(bytes);
      expect(result).toBeDefined();
      expect(result![0].name).toBe(name);
    };

    describe('basic keys', () => {
      it.each([
        { bytes: new Uint8Array([0x1b]), expectedName: 'ESC', expectedLength: 1, label: 'ESC' },
        { bytes: new Uint8Array([0x0d]), expectedName: 'ENTER', expectedLength: 1, label: 'ENTER' },
        { bytes: new Uint8Array([0x09]), expectedName: 'TAB', expectedLength: 1, label: 'TAB' },
        {
          bytes: new Uint8Array([0x7f]),
          expectedName: 'BACKSPACE',
          expectedLength: 1,
          label: 'BACKSPACE',
        },
        {
          bytes: new Uint8Array([0x04]),
          expectedName: 'DELETE',
          expectedLength: 1,
          label: 'DELETE (iTerm2)',
        },
        {
          bytes: new Uint8Array([0x08]),
          expectedName: 'DELETE',
          expectedLength: 1,
          label: 'DELETE (WezTerm)',
        },
      ])('should parse $label key', ({ bytes, expectedName, expectedLength }) => {
        const result = parseKey(bytes);
        expect(result).toBeDefined();
        expect(result![0].name).toBe(expectedName);
        expect(result![1]).toBe(expectedLength);
      });

      it('should parse BACKSPACE key without ctrl', () => {
        const result = parseKey(new Uint8Array([0x7f]));
        expect(result![0].ctrl).toBe(false);
      });
    });

    describe('ctrl+key combinations', () => {
      it.each([
        { bytes: new Uint8Array([0x1b, 0x7f]), expectedName: 'BACKSPACE' },
        { bytes: new Uint8Array([0x1b, 0x64]), expectedName: 'DELETE' },
      ])('should parse Ctrl+$expectedName', ({ bytes, expectedName }) => {
        const result = parseKey(bytes);
        expect(result).toBeDefined();
        expect(result![0].name).toBe(expectedName);
        expect(result![0].ctrl).toBe(true);
        expect(result![1]).toBe(2);
      });
    });

    describe('raw control bytes (ctrl+letter as raw bytes)', () => {
      it.each([
        { bytes: new Uint8Array([0x01]), expectedName: 'a', label: 'Ctrl+A (0x01)' },
        { bytes: new Uint8Array([0x03]), expectedName: 'c', label: 'Ctrl+C (0x03)' },
        { bytes: new Uint8Array([0x1a]), expectedName: 'z', label: 'Ctrl+Z (0x1a)' },
      ])('should parse $label as ctrl+$expectedName', ({ bytes, expectedName }) => {
        const result = Key.parse(bytes);
        expect(result).toBeDefined();
        expect(result![0].name).toBe(expectedName);
        expect(result![0].ctrl).toBe(true);
        expect(result![1]).toBe(1);
      });
    });

    describe('word navigation (Meta+b/f for macOS Option+arrow)', () => {
      it('should parse Meta+b as Alt+LEFT (backward-word)', () => {
        // \x1Bb (hex 1b62) is sent by WezTerm for Option+Left on macOS
        const result = parseKey(new Uint8Array([0x1b, 0x62]));
        expect(result).toBeDefined();
        expect(result![0].name).toBe('LEFT');
        expect(result![0].alt).toBe(true);
        expect(result![0].ctrl).toBe(false);
        expect(result![1]).toBe(2);
      });

      it('should parse Meta+f as Alt+RIGHT (forward-word)', () => {
        // \x1Bf (hex 1b66) is sent by WezTerm for Option+Right on macOS
        const result = parseKey(new Uint8Array([0x1b, 0x66]));
        expect(result).toBeDefined();
        expect(result![0].name).toBe('RIGHT');
        expect(result![0].alt).toBe(true);
        expect(result![0].ctrl).toBe(false);
        expect(result![1]).toBe(2);
      });
    });

    describe('text input', () => {
      it.each([
        { bytes: new Uint8Array([0x61]), expectedName: 'a', expectedText: 'a', expectedLength: 1 },
        {
          bytes: new Uint8Array([0x61, 0x62, 0x63]),
          expectedName: 'abc',
          expectedText: 'abc',
          expectedLength: 3,
        },
        {
          bytes: new Uint8Array([0x61, 0x62, 0x1b, 0x63]),
          expectedName: 'ab',
          expectedText: 'ab',
          expectedLength: 2,
        },
      ])(
        'should parse text "$expectedName"',
        ({ bytes, expectedName, expectedText, expectedLength }) => {
          const result = parseKey(bytes);
          expect(result).toBeDefined();
          expect(result![0].name).toBe(expectedName);
          expect(result![0].text).toBe(expectedText);
          expect(result![1]).toBe(expectedLength);
        },
      );
    });

    describe('arrow keys', () => {
      it.each([
        { sequence: '\x1b[D', expectedName: 'LEFT' },
        { sequence: '\x1b[C', expectedName: 'RIGHT' },
        { sequence: '\x1b[A', expectedName: 'UP' },
        { sequence: '\x1b[B', expectedName: 'DOWN' },
      ])('should parse $expectedName arrow key', ({ sequence, expectedName }) => {
        const result = parseKey(sequence);
        expect(result).toBeDefined();
        expect(result![0].name).toBe(expectedName);
      });
    });

    describe('navigation keys', () => {
      it.each([
        { sequence: '\x1b[H', expectedName: 'HOME' },
        { sequence: '\x1b[F', expectedName: 'END' },
        { sequence: '\x1b[5~', expectedName: 'PAGE_UP' },
        { sequence: '\x1b[6~', expectedName: 'PAGE_DOWN' },
        { sequence: '\x1b[2~', expectedName: 'INSERT' },
        { sequence: '\x1b[3~', expectedName: 'DELETE' },
      ])('should parse $expectedName key', ({ sequence, expectedName }) => {
        expectKeyName(sequence, expectedName);
      });
    });

    describe('function keys', () => {
      it.each([
        { sequence: '\x1b[11~', expectedName: 'F1' },
        { sequence: '\x1b[15~', expectedName: 'F5' },
        { sequence: '\x1b[24~', expectedName: 'F12' },
      ])('should parse $expectedName key', ({ sequence, expectedName }) => {
        expectKeyName(sequence, expectedName);
      });
    });

    describe('special keys', () => {
      it.each([
        { sequence: '\x1b[57358u', expectedName: 'CAPS_LOCK' },
        { sequence: '\x1b[57360u', expectedName: 'NUM_LOCK' },
        { sequence: '\x1b[57361u', expectedName: 'PRINT_SCREEN' },
      ])('should parse $expectedName key', ({ sequence, expectedName }) => {
        expectKeyName(sequence, expectedName);
      });
    });

    describe('modifier keys', () => {
      it.each([
        { sequence: '\x1b[57441u', expectedName: 'LEFT_SHIFT' },
        { sequence: '\x1b[57442u', expectedName: 'LEFT_CONTROL' },
        { sequence: '\x1b[57443u', expectedName: 'LEFT_ALT' },
        { sequence: '\x1b[57444u', expectedName: 'LEFT_SUPER' },
      ])('should parse $expectedName key', ({ sequence, expectedName }) => {
        expectKeyName(sequence, expectedName);
      });
    });

    describe('modifier combinations', () => {
      it.each([
        {
          sequence: '\x1b[65;2u',
          expectedModifiers: { shift: true, alt: false, ctrl: false },
          label: 'shift',
        },
        {
          sequence: '\x1b[65;3u',
          expectedModifiers: { shift: false, alt: true, ctrl: false },
          label: 'alt',
        },
        {
          sequence: '\x1b[65;5u',
          expectedModifiers: { shift: false, alt: false, ctrl: true },
          label: 'ctrl',
        },
        { sequence: '\x1b[65;9u', expectedModifiers: { super: true }, label: 'super' },
        {
          sequence: '\x1b[65;8u',
          expectedModifiers: { shift: true, alt: true, ctrl: true },
          label: 'shift+alt+ctrl',
        },
      ])('should parse key with $label modifier', ({ sequence, expectedModifiers }) => {
        const result = parseKey(sequence);
        expect(result).toBeDefined();
        const key = result![0];
        expect(key).toMatchObject(expectedModifiers);
      });
    });

    describe('event types', () => {
      it('should parse key press event (default)', () => {
        const result = parseKey('\x1b[65u');
        expect(result).toBeDefined();
        expect(result![0].event).toBe('press');
      });
    });

    describe('codepoint parsing', () => {
      it('should parse key with text codepoint', () => {
        const result = parseKey('\x1b[97;1;97u');
        expect(result).toBeDefined();
        expect(result![0].text).toBe('a');
      });
    });

    describe('edge cases', () => {
      it.each([
        { bytes: new Uint8Array([]), label: 'empty bytes' },
        { bytes: '\x1b[', label: 'incomplete escape sequence' },
      ])('should return undefined for $label', ({ bytes }) => {
        const result = parseKey(bytes);
        expect(result).toBeUndefined();
      });
    });
  });

  describe('create', () => {
    it('should create a key with specified properties', () => {
      const key = Key.create({ name: 'A', shift: true });
      expect(key.name).toBe('A');
      expect(key.shift).toBe(true);
      expect(key.ctrl).toBe(false);
      expect(key.alt).toBe(false);
    });

    it('should create a key with default properties', () => {
      const key = Key.create({});
      expect(key.name).toBe('');
      expect(key.shift).toBe(false);
      expect(key.ctrl).toBe(false);
      expect(key.alt).toBe(false);
      expect(key.super).toBe(false);
      expect(key.caps_lock).toBe(false);
      expect(key.num_lock).toBe(false);
      expect(key.event).toBe('press');
    });
  });
});
