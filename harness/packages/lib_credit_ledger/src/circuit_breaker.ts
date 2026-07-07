import type { CreditLedger, LedgerLogger } from './ledger';

/**
 * tier-3 backstop: if the local count is off and a group dies early, catch the
 * quota/blocked error, ask the bridge to retarget, and retry ONCE silently.
 *
 * this wraps any call that talks to the workflow service (direct-access mint,
 * ws upgrade, streaming send). the caller owns the actual retry semantics; the
 * breaker just decides "is this a retryable exhaustion signal?" and drives the
 * retarget.
 */

export interface PoolRetargeter {
  /**
   * synchronously flip the preferred/default namespace to a live standby. must
   * return the NEW active groupId (or throw if no standby is available).
   * MUST NOT block on group creation.
   */
  retargetToStandby(reason: string): Promise<string>;
}

export interface CircuitBreakerOptions {
  ledger: CreditLedger;
  retargeter: PoolRetargeter;
  logger: LedgerLogger;
  /** how many silent retries to allow across the full call chain. */
  maxSilentRetries?: number; // default 1 per call
}

/** shape-based check: any of these mean "this pool group is done, switch". */
export function isQuotaExhaustedError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as {
    status?: number;
    statusCode?: number;
    code?: string | number;
    message?: string;
    body?: unknown;
  };
  const status = e.status ?? e.statusCode;
  if (status === 402 || status === 429) return true;
  const msg = (e.message ?? '').toString().toLowerCase();
  if (
    msg.includes('usage_quota_exceeded') ||
    msg.includes('quota exceeded') ||
    msg.includes('duo default namespace specified does not allow') ||
    msg.includes('workflow_blocked') ||
    msg.includes('credits exhausted')
  ) {
    return true;
  }
  const bodyStr = safeStringify(e.body).toLowerCase();
  return bodyStr.includes('usage_quota_exceeded') || bodyStr.includes('credits_exceeded');
}

export class CircuitBreaker {
  #opts: Required<Omit<CircuitBreakerOptions, 'ledger' | 'retargeter' | 'logger'>> &
    Pick<CircuitBreakerOptions, 'ledger' | 'retargeter' | 'logger'>;

  constructor(opts: CircuitBreakerOptions) {
    this.#opts = { maxSilentRetries: 1, ...opts } as never;
  }

  /**
   * run `fn` and, if it throws a quota-exhaustion error, ask the pool for a
   * retarget and retry once. surfaces the error unchanged if:
   *   - it isn't a quota error
   *   - retarget itself failed (no standby available)
   *   - retries are exhausted
   */
  async guard<T>(fn: () => Promise<T>): Promise<T> {
    let attempts = 0;
    // deliberately not a while-loop with unbounded retries: burst mis-attribution
    // must never turn into a runaway spend loop.
    while (true) {
      try {
        // eslint-disable-next-line no-await-in-loop -- bounded retry (maxSilentRetries), sequential by design
        return await fn();
      } catch (err) {
        if (!isQuotaExhaustedError(err) || attempts >= this.#opts.maxSilentRetries) throw err;
        attempts += 1;
        const dead = this.#opts.ledger.getActiveGroupId();
        if (dead) this.#opts.ledger.markExhausted(dead, 'circuit-breaker: quota error on live traffic');
        try {
          // eslint-disable-next-line no-await-in-loop -- must retarget before the single retry
          const next = await this.#opts.retargeter.retargetToStandby(
            'circuit-breaker: quota error on live traffic',
          );
          this.#opts.ledger.setActiveGroup(next);
          this.#opts.logger.info(
            `circuit-breaker: retargeted '${dead ?? '<unknown>'}' -> '${next}'. retrying silently.`,
          );
        } catch (retargetErr) {
          this.#opts.logger.warn(
            'circuit-breaker: retarget failed; surfacing original error',
            retargetErr as Error,
          );
          throw err;
        }
      }
    }
  }
}

function safeStringify(v: unknown): string {
  try {
    return typeof v === 'string' ? v : JSON.stringify(v ?? '');
  } catch {
    return '';
  }
}
