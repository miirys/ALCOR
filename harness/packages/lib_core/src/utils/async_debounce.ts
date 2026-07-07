import { debounce, type DebouncedFunc } from 'lodash-es';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AsyncFunction = (...args: any[]) => Promise<unknown>;
export type AsyncDebouncedFunction<T extends AsyncFunction> = T;

/**
 * Creates a debounced version of an asynchronous function. A single promise is returned, which
 * resolves to the result of the latest fn call when the wait time expires.
 *
 * @template TFunc - The type of the asynchronous function to debounce.
 * @param {TFunc} func - The asynchronous function to debounce.
 * @param {number} wait - The number of milliseconds to delay.
 * @returns {AsyncDebouncedFunction<TFunc>} A new debounced function.
 */
export function asyncDebounce<TFunc extends AsyncFunction>(
  func: TFunc,
  wait: number,
): AsyncDebouncedFunction<TFunc> {
  type TResult = Awaited<ReturnType<TFunc>>;
  type TArgs = Parameters<TFunc>;

  const resolveSet = new Set<(value: TResult | PromiseLike<TResult>) => void>();
  const rejectSet = new Set<(reason?: unknown) => void>();

  const debounced: DebouncedFunc<(...args: TArgs) => void> = debounce(function debouncedFn(
    this: ThisParameterType<TFunc>,
    ...args: TArgs
  ) {
    func
      .apply(this, args)
      .then((result) => {
        resolveSet.forEach((resolve) => resolve(result as TResult));
        resolveSet.clear();
        rejectSet.clear();
        return result;
      })
      .catch((error: unknown) => {
        rejectSet.forEach((reject) => reject(error));
        resolveSet.clear();
        rejectSet.clear();
      });
  }, wait);

  return function debouncedWrapper(
    this: ThisParameterType<TFunc>,
    ...args: TArgs
  ): Promise<TResult> {
    return new Promise<TResult>((resolve, reject) => {
      resolveSet.add(resolve);
      rejectSet.add(reject);
      debounced.apply(this, args);
    });
  } as TFunc;
}
