/**
 * Unified input event system
 *
 * Public exports for the unified input system that normalizes
 * input from multiple sources (standard terminal and Kitty protocol)
 * into a single event stream with a consistent ParsedKey format.
 *
 * Based on OpenTUI's approach:
 * https://github.com/sst/opentui
 * Licensed under MIT License
 */

// Core types (from OpenTUI)
export type { ParsedKey } from './types';

// Parser (from OpenTUI - standard terminal only)
export { parseKeypress } from './opentui_parser';
export type { ParseKeypressOptions } from './opentui_parser';

// Normalization functions
export { normalizeKittyInput } from './handle_kitty_input';

// Unified input system
export { UnifiedInputSystem } from './unified_input_system';

// React integration
export { UnifiedInputProvider, UnifiedInputContext } from './unified_input_context';
export { useUnifiedInput } from './use_unified_input';
export { KeyChecks } from './key_checks';
