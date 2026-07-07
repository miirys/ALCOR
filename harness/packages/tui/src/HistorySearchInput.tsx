import React from 'react';
import { Box, Text } from 'ink';
import { doNotAwait } from '@gitlab-org/core';
import type { AppCallbacks, HistorySearchInputState } from './types';
import { SearchableList } from './lib/components/SearchableList';

interface HistorySearchInputProps {
  input: HistorySearchInputState;
  callbacks: AppCallbacks;
}

export const historySearchFooterHint = (): string | null =>
  '↑/↓ to select • Enter to apply • Del to remove • Esc to cancel';

interface HistoryMatch {
  item: string;
  matches: number[];
}

interface TruncationResult {
  displayText: string;
  matchStart: number;
  matchEnd: number;
}

/**
 * Truncates a history item for display, keeping the match visible with surrounding context.
 * Returns the truncated text and adjusted match positions for highlighting.
 */
function truncateHistoryItem(
  item: string,
  searchQuery: string,
  matchIndex: number,
): TruncationResult {
  const MAX_LENGTH = 150;
  const CONTEXT_CHARS = 40;
  const text = item.replace(/\n/g, ' ');

  // Treat no-match as a zero-length match at the start
  const safeMatchIndex = matchIndex === -1 ? 0 : matchIndex;
  const matchLength = matchIndex === -1 ? 0 : searchQuery.length;

  // Calculate window around match
  let start = Math.max(0, safeMatchIndex - CONTEXT_CHARS);
  let end = Math.min(text.length, safeMatchIndex + matchLength + CONTEXT_CHARS);

  // Expand to use remaining budget
  const slack = MAX_LENGTH - (end - start);
  if (slack > 0) {
    const expandLeft = Math.min(start, Math.floor(slack / 2));
    start -= expandLeft;
    end = Math.min(text.length, end + slack - expandLeft);
  }

  const prefix = start > 0 ? '...' : '';
  const suffix = end < text.length ? '...' : '';
  const adjustedMatchStart = matchIndex === -1 ? -1 : prefix.length + (matchIndex - start);

  return {
    displayText: prefix + text.slice(start, end) + suffix,
    matchStart: adjustedMatchStart,
    matchEnd: matchIndex === -1 ? -1 : adjustedMatchStart + searchQuery.length,
  };
}

function HistoryItemComponent({
  item,
  isSelected,
  searchQuery,
}: {
  item: HistoryMatch;
  isSelected: boolean;
  searchQuery: string;
}) {
  const matchIndex = item.matches[0] ?? -1;
  const { displayText, matchStart, matchEnd } = truncateHistoryItem(
    item.item,
    searchQuery,
    matchIndex,
  );

  const renderWithHighlight = () => {
    if (matchStart === -1 || matchEnd === -1) {
      return <>{displayText}</>;
    }

    const before = displayText.slice(0, matchStart);
    const match = displayText.slice(matchStart, matchEnd);
    const after = displayText.slice(matchEnd);

    return (
      <>
        {before}
        <Text bold color="yellow">
          {match}
        </Text>
        {after}
      </>
    );
  };

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
      <Text bold={isSelected}>{renderWithHighlight()}</Text>
    </Box>
  );
}

export const HistorySearchInput: React.FC<HistorySearchInputProps> = ({ input, callbacks }) => {
  const { searchQuery } = input;

  const BoundHistoryItem = React.useMemo(() => {
    return function HistoryItem({ item, isSelected }: { item: HistoryMatch; isSelected: boolean }) {
      return <HistoryItemComponent item={item} isSelected={isSelected} searchQuery={searchQuery} />;
    };
  }, [searchQuery]);

  return (
    <SearchableList
      items={input.filteredHistory}
      getItemKey={(_, index) => String(index)}
      ItemComponent={BoundHistoryItem}
      placeholder="Type to filter history..."
      onSearchChange={callbacks.onHistorySearchQueryChange}
      emptyText={
        input.searchQuery.trim() ? 'No matching history items found' : 'No prompt history yet'
      }
      onSelect={(item) => callbacks.onSelectHistoryItem(item.item)}
      onCancel={callbacks.onCancelHistorySearch}
      extraKeyHandler={(event, selectedItem) => {
        if (event.name === 'delete' && selectedItem) {
          doNotAwait(callbacks.onDeleteHistoryItem(selectedItem.item));
          event.stopPropagation();
        }
      }}
    />
  );
};
