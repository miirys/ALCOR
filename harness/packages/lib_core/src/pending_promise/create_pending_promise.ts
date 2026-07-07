import type { PendingPromise } from './pending_promise';

class DefaultPendingPromise<T> implements PendingPromise<T> {
  #promise: Promise<T> = Promise.resolve(0 as T);

  #resolver?: (value: T | PromiseLike<T>) => void;

  #rejector?: (reason?: unknown) => void;

  constructor() {
    this.#initializePromise();
  }

  resolve(value: T | PromiseLike<T>): void {
    this.#resolver?.(value);
    this.#initializePromise();
  }

  reject(reason?: unknown): void {
    this.#rejector?.(reason);
    this.#initializePromise();
  }

  get promise(): Promise<T> {
    return this.#promise;
  }

  #initializePromise() {
    this.#promise = new Promise<T>((resolve, reject) => {
      this.#resolver = resolve;
      this.#rejector = reject;
    });
  }
}

export const createPendingPromise = <T>(): PendingPromise<T> => {
  return new DefaultPendingPromise<T>();
};
