import { CancellationToken } from 'vscode-languageserver';

/**
 * Converts a CancellationToken to an AbortSignal for use with fetch requests.
 * This allows proper cancellation of in-flight HTTP requests.
 */
export function toAbortSignal(cancellationToken: CancellationToken): AbortSignal {
  const abortController = new AbortController();

  // If the token is already cancelled, abort immediately
  if (cancellationToken.isCancellationRequested) {
    abortController.abort();
    return abortController.signal;
  }

  // Listen for cancellation and abort the signal
  const disposable = cancellationToken.onCancellationRequested(() => {
    abortController.abort();
  });

  // Clean up the listener when the signal is aborted
  abortController.signal.addEventListener(
    'abort',
    () => {
      disposable.dispose();
    },
    { once: true },
  );

  return abortController.signal;
}
