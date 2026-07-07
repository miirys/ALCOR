/**
 * Type definitions for unified input event system
 *
 * Core types adapted from OpenTUI:
 * https://github.com/sst/opentui
 * Copyright (c) 2025 opentui
 * Licensed under MIT License
 *
 * Originally from https://github.com/enquirer/enquirer/blob/36785f3399a41cd61e9d28d1eb9c2fcd73d69b4c/lib/keypress.js
 *
 * https://github.com/anomalyco/opentui/blob/85e0582f95c22a792b320f6f8123dd1e433e2813/packages/core/src/lib/parse.keypress.ts
 *
 */

/**
 * Event type from Kitty keyboard protocol
 *
 * From OpenTUI: https://github.com/sst/opentui
 * - "press": Key was pressed down
 * - "repeat": Key is being held down (auto-repeat)
 * - "release": Key was released
 */
type KeyEventType = 'press' | 'repeat' | 'release';

/**
 * Parsed key event from any input source
 *
 * Interface adapted from OpenTUI's ParsedKey:
 * Local: /Users/tomas/workspace/third-party/cli/opentui/packages/core/src/lib/parse.keypress.ts
 * Repo: https://github.com/sst/opentui
 * Licensed under MIT License
 *
 * OpenTUI already includes all fields we need:
 * - `source` field to track input protocol
 * - `option` as alias for `meta`
 *
 * Our only addition:
 * - `timestamp` for event ordering
 */
export interface ParsedKey {
  // Core properties (from OpenTUI)
  /** Key identifier (e.g., "a", "escape", "up", "f1") - lowercase */
  name: string;

  /** The actual input sequence that was pressed */
  sequence: string;

  /** Raw input string */
  raw: string;

  // Modifiers (from OpenTUI)
  ctrl: boolean;
  meta: boolean; // Alt/Option key in OpenTUI
  shift: boolean;
  option: boolean; // Alias for meta (macOS compatibility)

  // Advanced modifiers (from OpenTUI)
  super?: boolean; // Windows/Command key
  hyper?: boolean; // Hyper modifier

  // Key type (from OpenTUI)
  number: boolean; // True if the key is a digit (0-9)

  // Event information (from OpenTUI)
  eventType: KeyEventType; // "press", "repeat", or "release"
  code?: string; // ANSI escape code

  // Advanced features (from OpenTUI - Kitty protocol)
  capsLock?: boolean; // Caps lock state
  numLock?: boolean; // Num lock state
  baseCode?: number; // Base layout codepoint (for keyboard layout disambiguation)
  repeated?: boolean; // True for key repeat events

  // Our extensions (not in OpenTUI)
  source: 'raw' | 'kitty'; // Which protocol was used
  timestamp: number; // Event timestamp
}
