import { ResultAsync, okAsync } from 'neverthrow';

export type AsyncCacheFetchFunc<T, E = Error> = (signal: AbortSignal) => ResultAsync<T, E>;

export type AsyncCacheOptions<T, E = Error> = Readonly<{
  /** If omitted, entries never expire until cleared. */
  ttlMs?: number;
  /** Function that fetches the value. Receives an AbortSignal. */
  fetcher: AsyncCacheFetchFunc<T, E>;
}>;

/**
 * Generic async cache with:
 * - Single-flight fetches (deduplication)
 * - Optional TTL
 */
export class AsyncCache<T, E = Error> {
  readonly #fetcher: AsyncCacheFetchFunc<T, E>;

  readonly #ttlMs?: number;

  #version = 0; // bump whenever we abort/clear/force refresh

  #cached?: T;

  #expiresAt?: number;

  #inflight?: ResultAsync<T, E>;

  #inflightVersion = -1; // version of the current inflight

  #abortController?: AbortController;

  constructor(opts: AsyncCacheOptions<T, E>) {
    this.#fetcher = opts.fetcher;
    this.#ttlMs = opts.ttlMs;
  }

  /**
   * Get cached value if fresh, otherwise fetch (with deduplication).
   */
  get(): ResultAsync<T, E> {
    if (this.#cached !== undefined && !this.#isExpired()) {
      return okAsync(this.#cached);
    }
    return this.#fetch(/* force */ false);
  }

  /**
   * Force a fresh fetch, aborting any in-flight request.
   */
  refresh(): ResultAsync<T, E> {
    this.#abortInflight();
    this.#version += 1;
    return this.#fetch(/* force */ true);
  }

  /**
   * Clear cached value and abort any in-flight request.
   */
  clear(): void {
    this.#abortInflight();
    this.#cached = undefined;
    this.#expiresAt = undefined;
    this.#version += 1;
  }

  /**
   * Check if there's a valid cached value.
   */
  has(): boolean {
    return this.#cached !== undefined && !this.#isExpired();
  }

  /**
   * Clean up resources. Call when disposing the cache.
   */
  dispose(): void {
    this.#abortInflight();
    this.#cached = undefined;
    this.#expiresAt = undefined;
  }

  // ---- private ----

  #isExpired(): boolean {
    if (this.#ttlMs == null) return false;
    if (this.#expiresAt == null) return true;
    return Date.now() >= this.#expiresAt;
  }

  #abortInflight(): void {
    if (this.#abortController) this.#abortController.abort();
    this.#abortController = undefined;
    this.#inflight = undefined;
    this.#inflightVersion = -1;
  }

  #fetch(force: boolean): ResultAsync<T, E> {
    if (!force && this.#inflight) return this.#inflight;

    this.#abortInflight();

    const controller = new AbortController();
    const myVersion = this.#version;
    this.#abortController = controller;

    const task = this.#fetcher(controller.signal).andTee((value) => {
      // only commit if still current and not aborted
      if (!controller.signal.aborted && myVersion === this.#version) {
        this.#cached = value;
        this.#expiresAt = this.#ttlMs == null ? undefined : Date.now() + this.#ttlMs;
      }

      // clear inflight on settle if this task is still the current one
      if (this.#inflightVersion === myVersion) {
        this.#abortController = undefined;
        this.#inflight = undefined;
        this.#inflightVersion = -1;
      }
    });

    this.#inflight = task;
    this.#inflightVersion = myVersion;
    return task;
  }
}
