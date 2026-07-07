/**
 * Tests for OpenTUI parser (standard terminal input)
 */

import { parseKeypress } from './opentui_parser';
import { expectParsedKey, expectFiltered } from './test_helpers';

describe('OpenTUI Parser', () => {
  describe('modifyOtherKeys protocol (CSI 27;modifier;code~)', () => {
    it.each([
      ['\x1b[27;5;27~', 'escape', { ctrl: true }],
      ['\x1b[27;2;13~', 'return', { shift: true }],
      ['\x1b[27;5;13~', 'return', { ctrl: true }],
      ['\x1b[27;5;9~', 'tab', { ctrl: true }],
      ['\x1b[27;5;32~', 'space', { ctrl: true }],
      ['\x1b[27;3;13~', 'return', { meta: true }],
      ['\x1b[27;6;13~', 'return', { ctrl: true, shift: true }],
      ['\x1b[27;5;97~', 'a', { ctrl: true }],
    ])('parses %s as %s with modifiers', (sequence, expectedName, modifiers) => {
      expectParsedKey(parseKeypress(sequence), { name: expectedName, source: 'raw', ...modifiers });
    });
  });

  describe('basic keys', () => {
    it.each([
      ['a', 'a', {}],
      ['A', 'A', {}],
      ['5', '5', {}],
      ['\r', 'return', {}],
      ['\x1b', 'escape', {}],
      ['\t', 'tab', {}],
      ['\x7f', 'backspace', {}],
      [' ', 'space', {}],
    ])('parses %j as %s', (input, expectedName, modifiers) => {
      expectParsedKey(parseKeypress(input), { name: expectedName, source: 'raw', ...modifiers });
    });

    it('detects number keys', () => {
      const result = parseKeypress('5');
      expect(result?.number).toBe(true);
    });
  });

  describe('arrow and navigation keys', () => {
    it.each([
      ['\x1b[A', 'up'],
      ['\x1b[B', 'down'],
      ['\x1b[C', 'right'],
      ['\x1b[D', 'left'],
      ['\x1b[H', 'home'],
      ['\x1b[F', 'end'],
      ['\x1b[5~', 'pageup'],
      ['\x1b[6~', 'pagedown'],
      ['\x1b[2~', 'insert'],
      ['\x1b[3~', 'delete'],
    ])('parses %s as %s', (sequence, expectedName) => {
      expectParsedKey(parseKeypress(sequence), { name: expectedName });
    });
  });

  describe('function keys', () => {
    it.each([
      ['\x1bOP', 'f1'],
      ['\x1bOQ', 'f2'],
      ['\x1b[15~', 'f5'],
      ['\x1b[24~', 'f12'],
    ])('parses %s as %s', (sequence, expectedName) => {
      expectParsedKey(parseKeypress(sequence), { name: expectedName });
    });
  });

  describe('control combinations', () => {
    it.each([
      ['\x01', 'a', true],
      ['\x03', 'c', true],
      ['\x00', 'space', true],
    ])('parses %j as ctrl+%s', (input, expectedName, ctrl) => {
      expectParsedKey(parseKeypress(input), { name: expectedName, ctrl });
    });
  });

  describe('meta/alt combinations', () => {
    it.each([
      ['\x1ba', 'a', { meta: true }],
      ['\x1b\r', 'return', { shift: true }], // ESC+Return treated as Shift+Enter becuse claude code does that, this is a change from how opentui handles it
    ])('parses %j as %s with modifiers', (input, expectedName, modifiers) => {
      expectParsedKey(parseKeypress(input), { name: expectedName, ...modifiers });
    });
  });

  describe('filtered input (mouse, terminal responses)', () => {
    it.each([
      '\x1b[<0;10;20M', // SGR mouse
      '\x1b[M abc', // basic mouse
      '\x1b[10;20R', // cursor position report
      '\x1b[?1;2c', // device attributes
      '\x1b[I', // focus in
      '\x1b[O', // focus out
      '\x1b[200~', // bracketed paste start
      '\x1b[201~', // bracketed paste end
    ])('filters %j', (input) => {
      expectFiltered(parseKeypress(input));
    });
  });

  describe('ParsedKey properties', () => {
    it('sets source, eventType, timestamp, sequence, and raw', () => {
      const before = Date.now();
      const result = parseKeypress('\x1b[A');
      const after = Date.now();

      expect(result?.source).toBe('raw');
      expect(result?.eventType).toBe('press');
      expect(result?.timestamp).toBeGreaterThanOrEqual(before);
      expect(result?.timestamp).toBeLessThanOrEqual(after);
      expect(result?.sequence).toBe('\x1b[A');
      expect(result?.raw).toBe('\x1b[A');
    });
  });
});
