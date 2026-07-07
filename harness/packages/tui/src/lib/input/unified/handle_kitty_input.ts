/**
 * Normalize Kitty protocol input to ParsedKey format
 *
 * Converts Kitty's UPPERCASE key names to OpenTUI's lowercase format
 * and preserves Kitty-specific features like caps_lock, event types, and PASTE.
 */

import type { Key } from '../../kitty-protocol';
import type { ParsedKey } from './types';

/**
 * Normalize Kitty protocol input
 *
 * Converts the Kitty Key class to OpenTUI ParsedKey format, preserving
 * Kitty-specific features like caps_lock, event types, and PASTE events.
 *
 * @param key - The Key object from Kitty protocol parser
 * @returns Normalized ParsedKey
 */
export function normalizeKittyInput(key: Key): ParsedKey {
  return {
    name: normalizeKittyKeyName(key.name),
    sequence: key.text || key.name.toLowerCase(),
    raw: key.text || key.name.toLowerCase(),
    ctrl: key.ctrl,
    meta: key.alt,
    shift: key.shift,
    option: key.alt,
    super: key.super,
    number: /^\d$/.test(key.name),
    eventType: key.event,
    capsLock: key.caps_lock,
    numLock: key.num_lock,
    baseCode: key.code?.base,
    source: 'kitty',
    timestamp: Date.now(),
  };
}

/**
 * Normalize Kitty key names to OpenTUI format
 *
 * Converts UPPERCASE Kitty key names (e.g., "ESC", "ENTER") to
 * lowercase OpenTUI names (e.g., "escape", "return").
 */
function normalizeKittyKeyName(name: string): string {
  const nameMap: Record<string, string> = {
    ESC: 'escape',
    ENTER: 'return',
    TAB: 'tab',
    BACKSPACE: 'backspace',
    DELETE: 'delete',
    INSERT: 'insert',
    LEFT: 'left',
    RIGHT: 'right',
    UP: 'up',
    DOWN: 'down',
    PAGE_UP: 'pageup',
    PAGE_DOWN: 'pagedown',
    HOME: 'home',
    END: 'end',
    CAPS_LOCK: 'capslock',
    SCROLL_LOCK: 'scrolllock',
    NUM_LOCK: 'numlock',
    PRINT_SCREEN: 'printscreen',
    PAUSE: 'pause',
    MENU: 'menu',
    LEFT_SHIFT: 'leftshift',
    LEFT_CONTROL: 'leftcontrol',
    LEFT_ALT: 'leftalt',
    LEFT_SUPER: 'leftsuper',
    RIGHT_SHIFT: 'rightshift',
    RIGHT_CONTROL: 'rightcontrol',
    RIGHT_ALT: 'rightalt',
    RIGHT_SUPER: 'rightsuper',
    PASTE: 'paste',
  };

  if (nameMap[name]) {
    return nameMap[name];
  }

  if (/^F\d+$/.test(name)) {
    return name.toLowerCase();
  }

  // The space key arrives as a literal ' ' in the Kitty protocol; normalize it to
  // 'space' to match the standard parser (parseKeypress) so consumers checking
  // event.name === 'space' work consistently across terminals.
  if (name === ' ') {
    return 'space';
  }

  // For single character names, preserve case (e.g., 'A' stays 'A', '_' stays '_')
  if (name.length === 1) {
    return name;
  }

  if (name.includes('_')) {
    return name.toLowerCase().replace(/_/g, '');
  }

  return name.toLowerCase();
}
