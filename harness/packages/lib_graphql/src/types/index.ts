export interface FallbackEvent {
  err?: unknown;
  unsupported?: 'future_field' | 'removed_field';
}

export interface GraphQLOperation<Data> {
  fallback: (event: FallbackEvent) => Data;
  supportedSinceInstanceVersion?: string;
  query: string;
}

export type PaginationInfo = {
  endCursor: string;
  startCursor: string;
  hasPreviousPage: boolean;
  hasNextPage: boolean;
};

export type * from './ai/chat';
export type * from './scalars';
export type * from './ai/workflows';
export type * from './ai/catalog';
