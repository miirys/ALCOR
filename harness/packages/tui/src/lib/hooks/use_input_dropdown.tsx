import React, { useEffect, useRef, useState } from 'react';
import { TextBuffer } from '../text_buffer';
import { Dropdown } from '../components/Dropdown';
import { type DropdownItem, DropdownItemComponent } from '../components/DropdownItem';
import type { DropdownProvider } from '../dropdown_provider';
import { useInputAction, usePublishInputContext } from '../keymap';

/** An item paired with the provider that produced it. */
interface ProvidedItem {
  item: DropdownItem;
  provider: DropdownProvider;
}

const getAllItems = async (
  providers: DropdownProvider[],
  text: string,
  position: { line: number; column: number },
): Promise<ProvidedItem[]> => {
  const results = await Promise.all(providers.map((p) => p.getItems(text, position)));

  const all: ProvidedItem[] = [];
  for (let i = 0; i < results.length; i++) {
    for (const item of results[i]) {
      all.push({ item, provider: providers[i] });
    }
  }

  return all;
};

export interface UseInputDropdownResult {
  /** Whether a dropdown is currently open — use to suppress key handling in the parent. */
  isOpen: boolean;
  /**
   * Call this from the text-change handler whenever the input value changes.
   * The hook queries providers for matching items.
   */
  onTextChange: (newValue: string) => Promise<void>;
  /** Immediately closes the dropdown without selecting anything. */
  close: () => void;
  /** Renders the active dropdown, or null when no dropdown is open. */
  renderDropdown: () => React.ReactNode;
}

/**
 * Manages dropdown state for a text input.
 *
 * All domain knowledge lives in the providers. This hook only handles the
 * mechanics: detecting word changes, querying providers, capping the result
 * list, rendering, and replacing the word on selection.
 *
 * **Shared mutable buffer:** the `textBufferRef` is mutated by this hook
 * (e.g. `replaceWordAtCursor` on selection) and read by the parent.
 * This is acceptable while there is only one consumer/mutator outside of
 * `TextInput`, but should be revisited if more writers appear.
 *
 * @param onSubmit - Optional. When provided, items with `submitAfterSelect`
 *   will call this after insertion when selected via Enter (not Tab).
 */
export const useInputDropdown = (
  textBufferRef: React.MutableRefObject<TextBuffer>,
  providers: DropdownProvider[],
  onSelect: (newText: string) => void,
  onSubmit?: () => Promise<void>,
): UseInputDropdownResult => {
  const [providedItems, setProvidedItems] = useState<ProvidedItem[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const latestValueRef = useRef('');
  const lastWordRef = useRef<string | null>(null);

  const isOpen = providedItems.length > 0;

  // Reset the highlighted item whenever the list of items changes.
  useEffect(() => {
    setSelectedIndex(0);
  }, [providedItems]);

  const close = () => {
    setProvidedItems([]);
  };

  const handleItemInsert = async ({ item, provider }: ProvidedItem) => {
    if (!item.enabled) return;
    textBufferRef.current.replaceWordAtCursor(item.replaceWith);
    onSelect(textBufferRef.current.text);
    await provider.onItemSelected?.(item);
    close();
  };

  const handleItemSubmit = async (providedItem: ProvidedItem) => {
    if (!providedItem.item.enabled) return;
    await handleItemInsert(providedItem);
    if (onSubmit) {
      await onSubmit();
    }
  };

  // Publish whether the dropdown is open so the keymap dispatcher can route the
  // conflict-prone keys (Tab/Enter/Escape/Up/Down) to the dropdown when relevant.
  usePublishInputContext({ dropdownOpen: isOpen });

  const safeIndex = Math.min(selectedIndex, providedItems.length - 1);

  useInputAction(
    'dropdown.next',
    () => setSelectedIndex((prev) => Math.min(providedItems.length - 1, prev + 1)),
    isOpen,
  );

  useInputAction('dropdown.prev', () => setSelectedIndex((prev) => Math.max(0, prev - 1)), isOpen);

  useInputAction(
    'dropdown.apply',
    async () => {
      if (safeIndex >= 0) {
        await handleItemInsert(providedItems[safeIndex]);
      }
    },
    isOpen,
  );

  useInputAction(
    'dropdown.applyOrSubmit',
    async () => {
      if (safeIndex < 0) return;
      const providedItem = providedItems[safeIndex];
      if (providedItem.item.submitAfterSelect && onSubmit) {
        await handleItemSubmit(providedItem);
      } else {
        await handleItemInsert(providedItem);
      }
    },
    isOpen,
  );

  useInputAction('dropdown.close', close, isOpen);

  const onTextChange = async (newValue: string): Promise<void> => {
    latestValueRef.current = newValue;

    const buffer = textBufferRef.current;
    const wordToCursor = buffer.getWordToCursor();

    if (lastWordRef.current === wordToCursor) return;
    lastWordRef.current = wordToCursor;

    const newItems = await getAllItems(providers, buffer.text, buffer.cursor);

    if (latestValueRef.current !== newValue) return;

    setProvidedItems(newItems);
  };

  const renderDropdown = (): React.ReactNode => {
    if (providedItems.length === 0) return null;
    return (
      <Dropdown
        items={providedItems}
        selectedIndex={selectedIndex}
        getKey={({ item, provider }) => `${provider.id}:${item.id}`}
        renderItem={({ item }, isSelected) => (
          <DropdownItemComponent item={item} isSelected={isSelected} />
        )}
      />
    );
  };

  return { isOpen, onTextChange, close, renderDropdown };
};
