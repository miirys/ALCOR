import React, { useState } from 'react';
import { Box, Text, useStdout } from 'ink';
import type { SlashCommand } from './types';
import { SearchableList } from './lib/components/SearchableList';

export interface SearchableCommandDialogCallbacks {
  onClose: () => void;
  onSelect: (name: string) => void;
}

export interface SearchableCommandDialogProps {
  /** The full, unfiltered list of commands to display. */
  items: SlashCommand[];
  /** Placeholder shown in the search input. */
  placeholder: string;
  /** Shown when there are no items at all. */
  emptyText: string;
  /** Shown when items exist but the filter matches none. */
  noMatchesText: string;
  callbacks: SearchableCommandDialogCallbacks;
}

const MAX_LIST_WIDTH = 120;

const CommandItem: React.FC<{ item: SlashCommand; isSelected: boolean }> = ({
  item,
  isSelected,
}) => (
  <Box
    flexDirection="column"
    borderLeft
    borderRight={false}
    borderTop={false}
    borderBottom={false}
    borderStyle="bold"
    borderColor={isSelected ? 'white' : 'blackBright'}
    paddingLeft={1}
  >
    <Text bold={isSelected} color="green">
      {item.name}
    </Text>
    {item.description && <Text dimColor>{item.description}</Text>}
  </Box>
);

/**
 * Generic searchable dialog over a list of {@link SlashCommand}s. Owns the
 * shared wiring (search filtering on name/description, keyboard navigation,
 * empty-state rendering) so concrete dialogs (skills, agents) only supply the
 * variable copy and callbacks.
 */
export const SearchableCommandDialog: React.FC<SearchableCommandDialogProps> = ({
  items,
  placeholder,
  emptyText,
  noMatchesText,
  callbacks,
}) => {
  const { stdout } = useStdout();
  const listWidth = Math.min(stdout?.columns || 80, MAX_LIST_WIDTH);
  const [filteredItems, setFilteredItems] = useState<SlashCommand[]>(items);

  const handleSearchChange = (query: string) => {
    const trimmed = query.trim().toLowerCase();
    if (!trimmed) {
      setFilteredItems(items);
      return;
    }
    setFilteredItems(
      items.filter(
        (item) =>
          item.name.toLowerCase().includes(trimmed) ||
          item.description.toLowerCase().includes(trimmed),
      ),
    );
  };

  return (
    <SearchableList
      items={filteredItems}
      getItemKey={(item) => item.name}
      ItemComponent={CommandItem}
      placeholder={placeholder}
      onSearchChange={handleSearchChange}
      emptyText={items.length === 0 ? emptyText : noMatchesText}
      onSelect={(item) => callbacks.onSelect(item.name)}
      onCancel={() => callbacks.onClose()}
      width={listWidth}
    />
  );
};
