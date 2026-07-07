/**
 * Calculates exponential backoff delay for retry operations.
 *
 * @param attempt The current attempt number
 * @param baseMs The base delay in milliseconds (default: 1000ms)
 * @param exponent The exponential multiplier (default: 2)
 * @returns The calculated delay in milliseconds
 */
export function calculateExponentialBackoff(
  attempt: number,
  baseMs: number = 1000,
  exponent: number = 2,
): number {
  return baseMs * exponent ** (attempt - 1);
}

/**
 * Simple delay utility that returns a Promise that resolves after the specified duration.
 *
 * If an {@link AbortSignal} is provided, the delay resolves early when the signal
 * aborts and the underlying timer is cleared so it does not dangle.
 *
 * @param ms Duration to wait in milliseconds
 * @param signal Optional abort signal that resolves the delay early when aborted
 * @returns Promise that resolves after the delay (or once aborted)
 */
export function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise<void>((resolve) => {
    if (signal?.aborted) {
      resolve();
      return;
    }

    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);

    function onAbort() {
      clearTimeout(timer);
      resolve();
    }

    signal?.addEventListener('abort', onAbort, { once: true });
  });
}
