import { createInterfaceId } from '@gitlab/needle';
import type { DropdownItem } from './components/DropdownItem';

export interface CursorPosition {
  /** Cursor line (0-indexed). */
  line: number;
  /** Cursor column (0-indexed). */
  column: number;
}

/**
 * Returns the word fragment from word-start up to the cursor position.
 */
export const getWordAtCursor = (text: string, position: CursorPosition): string => {
  const lines = text.split('\n');
  const line = lines[position.line] ?? '';
  const textToCursor = line.slice(0, position.column);
  const lastSpaceIndex = textToCursor.lastIndexOf(' ');
  return textToCursor.slice(lastSpaceIndex + 1);
};

/**
 * Returns true when the word at the cursor is at the beginning of its line
 * (only whitespace precedes it).
 */
export const isWordAtLineStart = (text: string, position: CursorPosition): boolean => {
  const lines = text.split('\n');
  const line = lines[position.line] ?? '';
  let wordStartIndex = position.column;
  while (wordStartIndex > 0 && line[wordStartIndex - 1] !== ' ') {
    wordStartIndex--;
  }
  return line.substring(0, wordStartIndex).trim() === '';
};

/**
 * A provider that can supply dropdown items for a text input.
 *
 * Each provider decides whether it handles the current input
 * and returns matching items, or an empty array when it has nothing to show.
 *
 * Use {@link getWordAtCursor} and {@link isWordAtLineStart} inside your
 * implementation to derive the word and line-start flag from text + position.
 */
export interface DropdownProvider {
  /**
   * Unique id for this provider, used to namespace item ids internally.
   * This prevents id collisions when multiple providers return items
   * that happen to share the same {@link DropdownItem.id}.
   */
  id: string;

  /**
   * Return items for the current input state.
   * Return an empty array if this provider doesn't handle the current input
   * or has no matching items.
   */
  getItems(text: string, position: CursorPosition): Promise<DropdownItem[]>;

  /**
   * Called after the user selects an item and the word has been replaced.
   * Optional — only needed when selection has side effects beyond text replacement.
   */
  onItemSelected?(item: DropdownItem): Promise<void>;
}

export const DropdownProvider = createInterfaceId<DropdownProvider>('DropdownProvider');
