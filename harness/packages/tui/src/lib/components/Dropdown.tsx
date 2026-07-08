import React from 'react';
import { Box, Text } from 'ink';
import { computeScrollWindow } from '../scroll_window';
import { colors } from '../colors';

export const DROPDOWN_CONTROLS_HINT = '↑↓ Choose · Tab/Enter Apply · Esc Close';

const DEFAULT_MAX_VISIBLE = 10;

interface DropdownProps<T> {
  items: T[];
  /** Index of the currently highlighted item. Owned by the parent/host. */
  selectedIndex: number;
  getKey: (item: T) => string | number;
  renderItem: (item: T, isSelected: boolean) => React.ReactNode;
  /** Maximum number of items visible at once before scrolling. Defaults to 10. */
  maxVisible?: number;
  /** Panel heading, e.g. "Commands" for the slash palette. */
  title?: string;
}

export const Dropdown = <T extends unknown>({
  items,
  selectedIndex,
  getKey,
  renderItem,
  maxVisible = DEFAULT_MAX_VISIBLE,
  title = 'Commands',
}: DropdownProps<T>) => {
  const safeIndex = Math.min(Math.max(0, selectedIndex), items.length - 1);
  const { visibleItems, windowStart, showScrollUp, showScrollDown } = computeScrollWindow(
    items,
    safeIndex,
    maxVisible,
  );

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={colors.border}
      paddingX={1}
      width={72}
    >
      <Box justifyContent="space-between">
        <Text color={colors.fg}>{title}</Text>
        <Text dimColor>{DROPDOWN_CONTROLS_HINT}</Text>
      </Box>
      {items.length === 0 ? (
        <Box paddingLeft={2}>
          <Text dimColor>No results found</Text>
        </Box>
      ) : (
        <>
          {showScrollUp && <Text dimColor>▲</Text>}
          {visibleItems.map((item, idx) => (
            <React.Fragment key={getKey(item)}>
              {renderItem(item, idx + windowStart === safeIndex)}
            </React.Fragment>
          ))}
          {showScrollDown && <Text dimColor>▼</Text>}
        </>
      )}
    </Box>
  );
};
