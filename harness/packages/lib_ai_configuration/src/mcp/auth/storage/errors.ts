import type { z } from 'zod';
import { type ErrorBase, createError } from '../../../core/error';
import { StorageKind } from './types';

type StorageNotFoundError = ErrorBase<
  'STORAGE_NOT_FOUND',
  { serverName: string; storageType: StorageKind }
>;

type StorageValidationError = ErrorBase<
  'STORAGE_VALIDATION_ERROR',
  { serverName: string; storageType: StorageKind; issues: z.ZodError }
>;

type StorageIOError = ErrorBase<
  'STORAGE_IO_ERROR',
  { serverName: string; storageType: StorageKind; cause?: unknown }
>;

export type StorageError = StorageNotFoundError | StorageValidationError | StorageIOError;

export const StorageError = {
  notFound: (serverName: string, storageType: StorageKind): StorageNotFoundError =>
    createError('STORAGE_NOT_FOUND', `${storageType} not found for server: ${serverName}`, {
      serverName,
      storageType,
    }),

  validation: (
    serverName: string,
    storageType: StorageKind,
    issues: z.ZodError,
  ): StorageValidationError =>
    createError('STORAGE_VALIDATION_ERROR', `${storageType} validation failed`, {
      serverName,
      storageType,
      issues,
    }),

  io: (serverName: string, storageType: StorageKind, cause?: unknown): StorageIOError =>
    createError('STORAGE_IO_ERROR', 'Storage I/O failed', { serverName, storageType, cause }),
} as const;
