import type { SessionListItem } from '@gitlab-org/tui';

export interface SessionHistoryPageInfo {
  hasNextPage: boolean;
  hasPreviousPage: boolean;
  endCursor?: string;
  startCursor?: string;
}

export interface SessionHistoryPage {
  items: SessionListItem[];
  pageInfo: SessionHistoryPageInfo;
}

export interface GetSessionHistoryOptions {
  pageSize?: number;
  afterCursor?: string;
  beforeCursor?: string;
  search?: string;
  signal?: AbortSignal;
}
