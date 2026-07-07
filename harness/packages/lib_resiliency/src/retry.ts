import { noop } from 'lodash-es';
import { AbortError, isAbortError } from './errors/abort_error';
import { Operation } from './types';

export type ShouldRetryCheck = (error: unknown) => boolean;

export const isNotAbort: ShouldRetryCheck = (err) => !isAbortError(err);

const shouldRetry = (check: ShouldRetryCheck | ShouldRetryCheck[], error: unknown): boolean => {
  const checks = Array.isArray(check) ? check : [check];
  return checks.every((ch) => ch(error));
};

const waitMs = (msToWait: number) =>
  new Promise((resolve) => {
    setTimeout(resolve, msToWait);
  });

const FIRST_ATTEMPT = 1;

export interface RetryOptions {
  /* max number of attempts, includes the first try (i.e. 3 means 1 original try + 2 retries), default value is 3 */
  max: number;
  /* how long to wait before retrying, default is 1000ms (1s) */
  backoffBaseMs: number;
  /* every retry, we multiply the previous backoff interval by this number, default is 1.5 */
  backoffExponent: number;
  /* is called *just before* each retry (after we waited the backoff interval) */
  onRetry: (retryCount: number, error: unknown) => unknown;
  /* if the callback(s) return false, `retry` will throw the last exception and won't retry */
  shouldRetry: ShouldRetryCheck | ShouldRetryCheck[];
  signal: AbortSignal;
}

const DEFAULT_OPTIONS: RetryOptions = {
  max: 3,
  backoffBaseMs: 1000,
  backoffExponent: 1.5,
  onRetry: noop,
  shouldRetry: isNotAbort,
  signal: new AbortController().signal,
};

async function privateRetry<T>(
  operation: (signal: AbortSignal) => Promise<T>,
  options: RetryOptions,
  attemptNumber: number,
): Promise<T> {
  try {
    if (options.signal.aborted) throw new AbortError();
    const result = await operation(options.signal);

    if (options.signal.aborted) throw new AbortError();
    return result;
  } catch (e) {
    if (options.max <= 1) throw e;
    if (!shouldRetry(options.shouldRetry, e)) throw e;

    await waitMs(options.backoffBaseMs);

    options.onRetry(attemptNumber, e);

    return privateRetry(
      operation,
      {
        ...options,
        max: options.max - 1,
        backoffBaseMs: options.backoffBaseMs * options.backoffExponent,
      },
      attemptNumber + 1,
    );
  }
}

/** throws `AbortError` if the `AbortSignal` gets aborted */
export function retry<T>(operation: Operation<T>, options: Partial<RetryOptions> = {}): Promise<T> {
  const fullOptions = { ...DEFAULT_OPTIONS, ...options };
  return privateRetry(operation, fullOptions, FIRST_ATTEMPT);
}
