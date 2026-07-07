import type { ParsedKey } from '../input/unified/types';

/**
 * Key event with propagation control
 *
 * Wraps ParsedKey with stopPropagation to enable event handling hierarchy
 */
export interface KeyEvent extends ParsedKey {
  stopPropagation(): void;
}

/**
 * Handler function for keyboard events
 */
export type KeyHandler = (event: KeyEvent) => void;
