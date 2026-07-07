import { ResultAsync } from 'neverthrow';
import { createInterfaceId } from '@gitlab/needle';
import { z } from 'zod';
import type { StorageError } from './errors';

export type StorageKind = 'Token' | 'ClientInfo';
export interface AuthStorage<T> {
  store(serverName: string, data: T): ResultAsync<void, StorageError>;
  load(serverName: string): ResultAsync<T, StorageError>;
  clear(serverName: string): ResultAsync<void, StorageError>;
}

// --- OAuth Token

export const Token = z.object({
  access_token: z.string(),
  token_type: z.string().default('Bearer'),
  expires_at: z.number().optional(), // Unix timestamp in ms
  refresh_token: z.string().optional(),
});

export type Token = z.infer<typeof Token>;

export interface TokenStorage extends AuthStorage<Token> {}
export const TokenStorage = createInterfaceId<TokenStorage>('TokenStorage');

// --- Client Info

export const ClientInfo = z.object({
  client_id: z.string(),
  client_secret: z.string().optional(),
});

export type ClientInfo = z.infer<typeof ClientInfo>;

export interface ClientInfoStorage extends AuthStorage<ClientInfo> {}
export const ClientInfoStorage = createInterfaceId<ClientInfoStorage>('ClientInfoStorage');
