import React from 'react';
import { Box, Text } from 'ink';
import { computeScrollWindow } from '../scroll_window';

export const DROPDOWN_CONTROLS_HINT = '↑/↓ to select • Tab or Enter to apply • Esc to close';

const DEFAULT_MAX_VISIBLE = 10;

interface DropdownProps<T> {
  items: T[];
  /** Index of the currently highlighted item. Owned by the parent/host. */
  selectedIndex: number;
  getKey: (item: T) => string | number;
  renderItem: (item: T, isSelected: boolean) => React.ReactNode;
  /** Maximum number of items visible at once before scrolling. Defaults to 10. */
  maxVisible?: number;
}

export const Dropdown = <T extends unknown>({
  items,
  selectedIndex,
  getKey,
  renderItem,
  maxVisible = DEFAULT_MAX_VISIBLE,
}: DropdownProps<T>) => {
  const safeIndex = Math.min(Math.max(0, selectedIndex), items.length - 1);
  const { visibleItems, windowStart, showScrollUp, showScrollDown } = computeScrollWindow(
    items,
    safeIndex,
    maxVisible,
  );

  return (
    <>
      {items.length === 0 ? (
        <Box paddingLeft={2}>
          <Text dimColor>No results found</Text>
        </Box>
      ) : (
        <>
          <Text dimColor>{showScrollUp ? '▲' : ' '}</Text>
          {visibleItems.map((item, idx) => (
            <React.Fragment key={getKey(item)}>
              {renderItem(item, idx + windowStart === safeIndex)}
            </React.Fragment>
          ))}
          <Text dimColor>{showScrollDown ? '▼' : ' '}</Text>
        </>
      )}
    </>
  );
};
