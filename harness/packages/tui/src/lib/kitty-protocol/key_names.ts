import { Key } from './key';

/**
 * Kitty Protocol Key Names
 *
 * Constants for key names used in the Kitty keyboard protocol.
 *
 * @see {@link https://sw.kovidgoyal.net/kitty/keyboard-protocol/#functional-key-definitions}
 *
 * ```
 */
export const KeyNames = {
  // Control keys
  /** Escape key */
  ESC: 'ESC',
  /** Enter/Return key */
  ENTER: 'ENTER',
  /** Tab key */
  TAB: 'TAB',
  /** Backspace key */
  BACKSPACE: 'BACKSPACE',
  /** Insert key */
  INSERT: 'INSERT',
  /** Delete key */
  DELETE: 'DELETE',

  // Arrow keys
  /** Left arrow key */
  LEFT: 'LEFT',
  /** Right arrow key */
  RIGHT: 'RIGHT',
  /** Up arrow key */
  UP: 'UP',
  /** Down arrow key */
  DOWN: 'DOWN',

  // Navigation keys
  /** Page Up key */
  PAGE_UP: 'PAGE_UP',
  /** Page Down key */
  PAGE_DOWN: 'PAGE_DOWN',
  /** Home key */
  HOME: 'HOME',
  /** End key */
  END: 'END',

  // Lock keys
  /** Caps Lock key */
  CAPS_LOCK: 'CAPS_LOCK',
  /** Scroll Lock key */
  SCROLL_LOCK: 'SCROLL_LOCK',
  /** Num Lock key */
  NUM_LOCK: 'NUM_LOCK',

  // Special keys
  /** Print Screen key */
  PRINT_SCREEN: 'PRINT_SCREEN',
  /** Pause key */
  PAUSE: 'PAUSE',
  /** Menu key */
  MENU: 'MENU',

  // Function keys
  /** F1 function key */
  F1: 'F1',
  /** F2 function key */
  F2: 'F2',
  /** F3 function key */
  F3: 'F3',
  /** F4 function key */
  F4: 'F4',
  /** F5 function key */
  F5: 'F5',
  /** F6 function key */
  F6: 'F6',
  /** F7 function key */
  F7: 'F7',
  /** F8 function key */
  F8: 'F8',
  /** F9 function key */
  F9: 'F9',
  /** F10 function key */
  F10: 'F10',
  /** F11 function key */
  F11: 'F11',
  /** F12 function key */
  F12: 'F12',

  // Modifier keys (when pressed directly)
  /** Left Shift key */
  LEFT_SHIFT: 'LEFT_SHIFT',
  /** Left Control key */
  LEFT_CONTROL: 'LEFT_CONTROL',
  /** Left Alt/Option key */
  LEFT_ALT: 'LEFT_ALT',
  /** Left Super/Command/Windows key */
  LEFT_SUPER: 'LEFT_SUPER',
  /** Right Shift key */
  RIGHT_SHIFT: 'RIGHT_SHIFT',
  /** Right Control key */
  RIGHT_CONTROL: 'RIGHT_CONTROL',
  /** Right Alt/Option key */
  RIGHT_ALT: 'RIGHT_ALT',
  /** Right Super/Command/Windows key */
  RIGHT_SUPER: 'RIGHT_SUPER',

  /** Everything below is our custom extension of the protocol */
  /** Paste vertiual key */
  PASTE: 'PASTE',
} as const;

/**
 * Type representing valid Kitty protocol key names
 */
export type KeyName = (typeof KeyNames)[keyof typeof KeyNames];

/**
 * Common key combinations for convenience
 */
export const KeyCombinations = {
  /**
   * Check if Ctrl+C was pressed
   */
  isCtrl: (keyName: string, key: Key) => key.event === 'press' && key.ctrl && key.name === keyName,

  isSpecialKey: (key: Key) => Object.values(KeyNames).includes(key.name as KeyName),

  /**
   * Check if Shift+Enter was pressed
   */
  isShiftEnter: (key: Key) => key.event === 'press' && key.shift && key.name === KeyNames.ENTER,

  /**
   * Check if Alt+Enter was pressed
   */
  isAltEnter: (key: Key) => key.event === 'press' && key.alt && key.name === KeyNames.ENTER,

  /**
   * Check if Ctrl+J was pressed (alternative newline)
   */
  isCtrlJ: (key: Key) => key.event === 'press' && key.ctrl && key.name === 'j',

  /**
   * Check if Escape was pressed
   */
  isEscape: (key: Key) => key.event === 'press' && key.name === KeyNames.ESC,

  /**
   * Check if Enter was pressed (without modifiers)
   */
  isEnter: (key: Key) =>
    key.event === 'press' && key.name === KeyNames.ENTER && !key.ctrl && !key.shift && !key.alt,

  /**
   * Check if Tab was pressed
   */
  isTab: (key: Key) => key.event === 'press' && key.name === KeyNames.TAB,

  /**
   * Check if Shift+Tab was pressed
   */
  isShiftTab: (key: Key) => key.event === 'press' && key.shift && key.name === KeyNames.TAB,
} as const;
