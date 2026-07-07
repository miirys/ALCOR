type PromiseFunction<T, R> = (args: T) => Promise<R>;
type CallbackFunction<T, E, R> = (args: T, callback: (error: E | null, result?: R) => void) => void;

/**
 * Convert a promise-based API into a callback-based API.
 * This is equivalent to {@link node:util.callbackify}
 *
 * @param promiseFn - A function that returns a promise.
 * @returns A function that uses a callback.
 */
export const callbackify =
  <T, E, R>(promiseFn: PromiseFunction<T, R>): CallbackFunction<T, E, R> =>
  (args: T, callback: (error: E | null, result?: R) => void): void => {
    promiseFn(args)
      // eslint-disable-next-line promise/no-callback-in-promise
      .then((result) => callback(null, result))
      // eslint-disable-next-line promise/no-callback-in-promise
      .catch((error) => callback(error as E));
  };
