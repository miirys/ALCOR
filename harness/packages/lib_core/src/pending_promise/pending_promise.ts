/**
 * An unresolved promise that can be resolved or rejected at a later time
 * using the resolve and reject methods. The unresolved promise is reset
 * after being resolved or rejected, allowing for a new promise to be created.
 */
export interface PendingPromise<T> {
  promise: Promise<T>;
  resolve: (value: T | PromiseLike<T>) => void;
  reject: (reason?: unknown) => void;
}
