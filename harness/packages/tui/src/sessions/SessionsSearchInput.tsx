import React from 'react';
import { useStdout } from 'ink';
import type { SessionsSearchInputState } from '../types';
import { SearchableList } from '../lib/components/SearchableList';
import { SessionItem } from './SessionItem';

export interface SessionsCallbacks {
  onCancelSessionsSearch: () => void;
  onSessionsSearchQueryChange: (query: string) => void;
  onSelectSession: (sessionId: string) => void;
  onLoadMoreSessions: () => void;
}

interface SessionsSearchInputProps {
  input: SessionsSearchInputState;
  callbacks: SessionsCallbacks;
}

const MAX_LIST_WIDTH = 120;

export const sessionsSearchFooterHint = (input: SessionsSearchInputState): string | null =>
  input.sessions.length > 0
    ? '↑/↓ to select • Enter to load session • Esc to cancel'
    : 'Esc to cancel';

export const SessionsSearchInput: React.FC<SessionsSearchInputProps> = ({ input, callbacks }) => {
  const { stdout } = useStdout();
  const listWidth = Math.min(stdout?.columns || 80, MAX_LIST_WIDTH);

  return (
    <SearchableList
      items={input.sessions}
      getItemKey={(session) => session.id}
      ItemComponent={SessionItem}
      placeholder="Type to search sessions..."
      onSearchChange={(query) => callbacks.onSessionsSearchQueryChange(query)}
      emptyText={input.searchQuery.trim() ? 'No matching sessions found' : 'No sessions available'}
      onSelect={(session) => callbacks.onSelectSession(session.id)}
      onCancel={() => callbacks.onCancelSessionsSearch()}
      width={listWidth}
      isLoading={input.isLoading}
      loadingText="Loading sessions..."
      hasNextPage={input.hasNextPage}
      onLoadMore={() => callbacks.onLoadMoreSessions()}
    />
  );
};
