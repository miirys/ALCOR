/**
 * Helper functions for checking key combinations
 *
 * These provide a consistent, readable way to check for common key patterns.
 * This module is intentionally free of any React dependency so it can be
 * imported from non-React code (e.g. the keymap dispatcher) without pulling
 * in JSX modules.
 *
 * @example
 * ```tsx
 * useUnifiedInput((key) => {
 *   if (KeyChecks.isEnter(key)) {
 *     handleSubmit();
 *   } else if (KeyChecks.isCtrl('c', key)) {
 *     handleCancel();
 *   }
 * });
 * ```
 */

import type { ParsedKey } from './types';

export const KeyChecks = {
  /**
   * Check if key is Enter (without modifiers)
   * Note: key.name is "return" not "enter" in OpenTUI parser
   */
  isEnter: (key: ParsedKey): boolean =>
    key.name === 'return' && !key.ctrl && !key.shift && !key.meta,

  /**
   * Check if key is Shift+Enter
   */
  isShiftEnter: (key: ParsedKey): boolean =>
    key.name === 'return' && key.shift && !key.ctrl && !key.meta,

  /**
   * Check if key is Ctrl+<char>
   * @param char - The character to check (e.g., 'c', 's', 'r')
   */
  isCtrl: (char: string, key: ParsedKey): boolean => key.name === char && key.ctrl,

  /**
   * Check if key is Tab (without Shift)
   */
  isTab: (key: ParsedKey): boolean => key.name === 'tab' && !key.shift,

  /**
   * Check if key is Shift+Tab
   */
  isShiftTab: (key: ParsedKey): boolean => key.name === 'tab' && key.shift,
};
