import { AbortError } from './errors/abort_error';

const getMessage = (abortSignalReason: unknown): string => {
  if (abortSignalReason === undefined || abortSignalReason === null) {
    return 'Operation was aborted';
  }

  return abortSignalReason instanceof Error ? abortSignalReason.message : String(abortSignalReason);
};

/**
 * Wraps an AbortSignal as a promise that can be raced against another async operation.
 * This allows aborting any promise-based workflow that doesn't natively support AbortSignal
 */
export function asPromise(signal: AbortSignal): Promise<never> {
  return new Promise<never>((_, reject) => {
    if (signal.aborted) {
      reject(new AbortError(getMessage(signal.reason)));
      return;
    }

    signal.addEventListener('abort', () => {
      reject(new AbortError(getMessage(signal.reason)));
    });
  });
}
