import type { CreditLedger, LedgerLogger } from './ledger';
import type { GroupUsageSnapshot } from './types';

/**
 * contract with the in-process bridge (formerly duo-bridge). the bridge owns
 * the pool state and namespace switching; the ledger owns the threshold
 * decision. this file is the ONLY handshake between them.
 *
 * hard requirement from the plan: standby groups must be fully duo/trial-active
 * BEFORE they're needed. `getReadyStandby()` MUST NOT return a group that has
 * not passed the bridge's own readiness check, or the "instant" switch lands
 * on a group that can't serve.
 */
export interface PoolBridge {
  /** returns the id of a standby group already verified ready to serve. */
  getReadyStandby(): Promise<string | null>;

  /** flip the preferred/default namespace to `newGroupId`. blocks only long
   *  enough to update the graphql user preference; does NOT wait for the
   *  gateway settle period the bridge already handles internally. */
  switchNamespaceTo(newGroupId: string): Promise<void>;

  /** kick off async delete-and-replace of an exhausted group. non-blocking. */
  scheduleReplacement(exhaustedGroupId: string): void;

  /** convenience: the current active groupId per the bridge's view. */
  getActiveGroupId(): string | null;
}

export interface ThresholdControllerOptions {
  ledger: CreditLedger;
  bridge: PoolBridge;
  logger: LedgerLogger;
}

/**
 * glue: subscribe to ledger.thresholdReached, ask the bridge for a ready
 * standby, flip namespace, mark the old group exhausted, schedule its
 * replacement. never blocks the current turn.
 *
 * this is what actually turns "21.6/24 crossed" into "the next request goes
 * to a fresh group". the bridge is persistent and always running (per the plan),
 * so this can be attached once at cli boot.
 */
export class ThresholdController {
  #ledger: CreditLedger;

  #bridge: PoolBridge;

  #logger: LedgerLogger;

  #unsubscribe: (() => void) | undefined;

  #inFlight = false;

  constructor(opts: ThresholdControllerOptions) {
    this.#ledger = opts.ledger;
    this.#bridge = opts.bridge;
    this.#logger = opts.logger;
  }

  start(): void {
    if (this.#unsubscribe) return;
    this.#unsubscribe = this.#ledger.on('thresholdReached', (snapshot) => {
      this.#handleThreshold(snapshot).catch((err) => {
        this.#logger.warn('thresholdController: switch attempt failed', err as Error);
      });
    });
    this.#logger.info('thresholdController: attached to ledger.thresholdReached');
  }

  stop(): void {
    this.#unsubscribe?.();
    this.#unsubscribe = undefined;
  }

  async #handleThreshold(snapshot: GroupUsageSnapshot): Promise<void> {
    if (this.#inFlight) {
      this.#logger.debug?.('thresholdController: switch already in flight, ignoring duplicate');
      return;
    }
    this.#inFlight = true;
    try {
      const exhaustedId = snapshot.groupId;
      const standby = await this.#bridge.getReadyStandby();
      if (!standby) {
        this.#logger.warn(
          `thresholdController: no ready standby at threshold on '${exhaustedId}'. ` +
            'circuit breaker will cover the next call if this group actually dies.',
        );
        return;
      }
      await this.#bridge.switchNamespaceTo(standby);
      this.#ledger.markExhausted(exhaustedId, 'threshold reached, switched');
      this.#ledger.setActiveGroup(standby);
      this.#bridge.scheduleReplacement(exhaustedId); // async, non-blocking
      this.#logger.info(
        `thresholdController: switched '${exhaustedId}' -> '${standby}' at ` +
          `${snapshot.creditsUsed.toFixed(2)}/${snapshot.creditsCap}. replacement scheduled.`,
      );
    } finally {
      this.#inFlight = false;
    }
  }
}
