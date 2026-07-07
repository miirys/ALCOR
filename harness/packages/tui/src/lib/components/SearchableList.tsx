import React, { useState } from 'react';
import { Box, Text } from 'ink';
import { useKeyHandler } from '../key_handler';
import type { KeyEvent } from '../key_handler/types';
import { computeScrollWindow } from '../scroll_window';
import { MultilineTextInput } from './MultilineTextInput';
import { Spinner } from './Spinner';

const DEFAULT_MAX_VISIBLE = 10;

function DefaultItemComponent<T>({ item, isSelected }: { item: T; isSelected: boolean }) {
  return (
    <Box
      borderLeft
      borderRight={false}
      borderTop={false}
      borderBottom={false}
      borderStyle="bold"
      borderColor={isSelected ? 'white' : 'blackBright'}
      paddingLeft={1}
    >
      <Text bold={isSelected}>{String(item)}</Text>
    </Box>
  );
}

export interface SearchableListProps<T> {
  items: T[];
  getItemKey: (item: T, index: number) => string;
  ItemComponent?: React.ComponentType<{ item: T; isSelected: boolean }>;

  placeholder: string;
  onSearchChange: (query: string) => void;

  emptyText: string;

  onSelect: (item: T, index: number) => void;
  onCancel: () => void;

  extraKeyHandler?: (event: KeyEvent, selectedItem: T | undefined, index: number) => void;
  maxVisible?: number;
  width?: number;

  isLoading?: boolean;
  loadingText?: string;

  hasNextPage?: boolean;
  onLoadMore?: () => void;

  showSeparators?: boolean;
}

/**
 * Generic searchable list with keyboard navigation, window-based scrolling,
 * and optional load-more pagination.
 *
 * Built-in keyboard handling:
 * - **↑/↓** — move selection
 * - **Enter** — select item (or trigger load-more)
 * - **Escape / Ctrl+C** — cancel
 * - Additional keys via `extraKeyHandler`
 *
 * @example
 * // Minimal usage — default renderer displays String(item)
 * <SearchableList
 *   items={['alpha', 'bravo', 'charlie']}
 *   getItemKey={(item) => item}
 *   placeholder="Search..."
 *   onSearchChange={handleSearch}
 *   emptyText="No results"
 *   onSelect={(item) => console.log(item)}
 *   onCancel={() => {}}
 * />
 *
 * @example
 * // Custom item renderer for complex types
 * function SessionItem(props: { item: Session; isSelected: boolean }) {
 *   return <Text bold={props.isSelected}>{props.item.title}</Text>;
 * }
 *
 * <SearchableList
 *   items={sessions}
 *   getItemKey={(s) => s.id}
 *   ItemComponent={SessionItem}
 *   placeholder="Search sessions..."
 *   onSearchChange={handleSearch}
 *   emptyText="No sessions"
 *   onSelect={(session) => load(session.id)}
 *   onCancel={() => {}}
 * />
 */
export function SearchableList<T>({
  items,
  getItemKey,
  ItemComponent = DefaultItemComponent,
  placeholder,
  onSearchChange,
  emptyText,
  onSelect,
  onCancel,
  extraKeyHandler,
  maxVisible = DEFAULT_MAX_VISIBLE,
  width,
  isLoading = false,
  loadingText,
  hasNextPage = false,
  onLoadMore,
  showSeparators = true,
}: SearchableListProps<T>): React.ReactElement {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);

  const hasLoadMore = hasNextPage && !isLoading && onLoadMore;
  const { visibleItems, windowStart, showScrollUp, showScrollDown } = computeScrollWindow(
    items,
    selectedIndex,
    maxVisible,
  );
  const loadMoreIsVisible = hasLoadMore && !showScrollDown;
  const maxIndex = items.length - 1 + (loadMoreIsVisible ? 1 : 0);
  const isLoadMoreSelected = loadMoreIsVisible && selectedIndex === items.length;

  useKeyHandler((event) => {
    if (event.eventType !== 'press') return;

    if (event.name === 'escape' || (event.ctrl && event.name === 'c')) {
      onCancel();
      event.stopPropagation();
      return;
    }

    if (event.name === 'return') {
      if (isLoadMoreSelected && onLoadMore) {
        onLoadMore();
      } else if (items.length > 0) {
        onSelect(items[selectedIndex], selectedIndex);
      }
      event.stopPropagation();
      return;
    }

    if (event.name === 'up' && selectedIndex > 0) {
      setSelectedIndex(selectedIndex - 1);
      event.stopPropagation();
      return;
    }

    if (event.name === 'down' && selectedIndex < maxIndex) {
      setSelectedIndex(selectedIndex + 1);
      event.stopPropagation();
      return;
    }

    if (extraKeyHandler) {
      extraKeyHandler(event, items[selectedIndex], selectedIndex);
    }
  });

  const handleChange = (newQuery: string) => {
    setSearchQuery(newQuery);
    setSelectedIndex(0);
    onSearchChange(newQuery);
  };

  const hasItems = items.length > 0;
  const hasNoResults = !hasItems && !isLoading;

  return (
    <>
      <MultilineTextInput value={searchQuery} onChange={handleChange} placeholder={placeholder} />

      {hasItems && (
        <Box flexDirection="column" width={width}>
          {/* Always render the indicator rows — an arrow when scrollable, a blank
              space otherwise — to reserve the row so the list does not shift. */}
          <Text dimColor>{showScrollUp ? '▲' : ' '}</Text>
          {visibleItems.map((item, idx) => {
            const globalIndex = idx + windowStart;
            const isLastItem = idx === visibleItems.length - 1;
            return (
              <React.Fragment key={getItemKey(item, globalIndex)}>
                <ItemComponent item={item} isSelected={globalIndex === selectedIndex} />
                {showSeparators && !isLastItem && (
                  <Box
                    borderLeft
                    borderRight={false}
                    borderTop={false}
                    borderBottom={false}
                    borderStyle="bold"
                    borderColor="blackBright"
                    height={1}
                  />
                )}
              </React.Fragment>
            );
          })}
          <Text dimColor>{showScrollDown ? '▼' : ' '}</Text>
        </Box>
      )}

      {loadMoreIsVisible && (
        <Box marginTop={1}>
          <Text bold={isLoadMoreSelected} color="cyan">
            {isLoadMoreSelected ? '▸ ' : '  '}Load more...
          </Text>
        </Box>
      )}

      {isLoading && loadingText && (
        <Box marginTop={1}>
          <Spinner text={loadingText} />
        </Box>
      )}

      {hasNoResults && (
        <Box marginTop={1}>
          <Text dimColor>{emptyText}</Text>
        </Box>
      )}
    </>
  );
}
