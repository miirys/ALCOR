import { ErrorBase, createError } from '../../../core/error';

type InvalidConfigError = ErrorBase<
  'TRANSPORT_INVALID_CONFIG',
  { serverName: string; reason: string }
>;

type CreationFailedError = ErrorBase<
  'TRANSPORT_CREATION_FAILED',
  { serverName: string; transportType: string; cause: unknown }
>;

type InvalidUrlError = ErrorBase<'TRANSPORT_INVALID_URL', { serverName: string; url: string }>;

export type TransportError = InvalidConfigError | CreationFailedError | InvalidUrlError;

export const TransportError = {
  invalidConfig: (serverName: string, reason: string): InvalidConfigError =>
    createError(
      'TRANSPORT_INVALID_CONFIG',
      `Invalid transport config for ${serverName}: ${reason}`,
      {
        serverName,
        reason,
      },
    ),

  creationFailed: (
    serverName: string,
    transportType: string,
    cause: unknown,
  ): CreationFailedError =>
    createError(
      'TRANSPORT_CREATION_FAILED',
      `Failed to create ${transportType} transport for ${serverName}`,
      { serverName, transportType, cause },
    ),

  invalidUrl: (serverName: string, url: string): InvalidUrlError =>
    createError('TRANSPORT_INVALID_URL', `Invalid URL for ${serverName}: ${url}`, {
      serverName,
      url,
    }),
} as const;
