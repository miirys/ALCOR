import { EventEmitter } from 'node:events';
import type { GroupUsageSnapshot, LedgerPersistedState, PricedEvent, UsageEvent } from './types';
import { priceEvent } from './attribution';

/**
 * abstract storage. we keep the persistence surface tiny (get/set/delete) so
 * the ledger can plug into either the cli's UserPersistentStorage or a plain
 * file-backed store in tests / the bridge.
 */
export interface LedgerStorage {
  read(): Promise<LedgerPersistedState | undefined>;
  write(state: LedgerPersistedState): Promise<void>;
}

export interface LedgerLogger {
  info(msg: string): void;
  warn(msg: string, err?: Error): void;
  debug?(msg: string): void;
}

export interface LedgerOptions {
  /** hard cap per group. must match the bridge's fixed 24-credit budget. */
  perGroupCapCredits: number; // 24
  /** fraction of the cap that fires thresholdReached. 0.9 => 21.6 of 24. */
  thresholdFraction: number; // 0.9
  /** cap the seen-event dedupe window (memory bound). */
  seenEventIdWindow?: number; // default 4096
  /** debounce persistence writes (ms). default 250. */
  persistDebounceMs?: number;
  storage: LedgerStorage;
  logger: LedgerLogger;
}

export type LedgerEvents = {
  /** fires exactly once per group when creditsUsed first crosses the threshold. */
  thresholdReached: (snapshot: GroupUsageSnapshot) => void;
  /** fires when creditsUsed reaches or exceeds the cap. */
  capReached: (snapshot: GroupUsageSnapshot) => void;
  /** fires for every priced event (attributed or not), for telemetry/debug UI. */
  eventPriced: (priced: PricedEvent, snapshot: GroupUsageSnapshot) => void;
  /** fires when priceEvent returned unattributed=true. loud on purpose. */
  unattributed: (priced: PricedEvent) => void;
};

/**
 * per-pool-group ledger. this class is intentionally sync-ish: every attribute
 * call updates in-memory state immediately and schedules a debounced persist.
 * the switch decision is derived from the *in-memory* number so a burst of
 * events during a persist can never race the threshold.
 */
export class CreditLedger {
  #opts: Required<Omit<LedgerOptions, 'storage' | 'logger'>> &
    Pick<LedgerOptions, 'storage' | 'logger'>;

  #state: LedgerPersistedState = {
    version: 1,
    groups: {},
    seenEventIds: [],
  };

  #emitter = new EventEmitter();

  #persistTimer: ReturnType<typeof setTimeout> | undefined;

  #loaded = false;

  constructor(opts: LedgerOptions) {
    this.#opts = {
      seenEventIdWindow: 4096,
      persistDebounceMs: 250,
      ...opts,
    } as never;
  }

  async load(): Promise<void> {
    const persisted = await this.#opts.storage.read();
    if (persisted && persisted.version === 1) {
      this.#state = persisted;
    }
    this.#loaded = true;
  }

  isLoaded(): boolean {
    return this.#loaded;
  }

  on<K extends keyof LedgerEvents>(event: K, handler: LedgerEvents[K]): () => void {
    this.#emitter.on(event, handler as (...a: unknown[]) => void);
    return () => this.#emitter.off(event, handler as (...a: unknown[]) => void);
  }

  /** the active group. bridge and cli must agree on this id. */
  setActiveGroup(groupId: string): void {
    this.#state.activeGroupId = groupId;
    this.#ensureGroup(groupId);
    this.#schedulePersist();
  }

  getActiveGroupId(): string | undefined {
    return this.#state.activeGroupId;
  }

  getSnapshot(groupId: string): GroupUsageSnapshot | undefined {
    return this.#state.groups[groupId];
  }

  getActiveSnapshot(): GroupUsageSnapshot | undefined {
    return this.#state.activeGroupId ? this.#state.groups[this.#state.activeGroupId] : undefined;
  }

  /** called when the bridge has switched off `groupId` (post-exhaustion). */
  markExhausted(groupId: string, reason?: string): void {
    const g = this.#ensureGroup(groupId);
    g.exhausted = true;
    g.thresholdFired = true;
    this.#opts.logger.info(
      `ledger: group '${groupId}' marked exhausted${reason ? ` (${reason})` : ''}. ` +
        `credits=${g.creditsUsed.toFixed(3)}/${g.creditsCap}`,
    );
    this.#schedulePersist();
  }

  /** drops a group entirely (bridge deleted it and provisioned a replacement). */
  forgetGroup(groupId: string): void {
    delete this.#state.groups[groupId];
    if (this.#state.activeGroupId === groupId) this.#state.activeGroupId = undefined;
    this.#schedulePersist();
  }

  /**
   * price + accumulate one event against the currently-active group. returns
   * the priced event so callers can log / telemetry it.
   *
   * dedupes by eventId within a bounded window so a retry storm (network hiccup)
   * can't double-count.
   */
  attribute(ev: UsageEvent): PricedEvent {
    if (!this.#loaded) {
      throw new Error('CreditLedger.attribute() called before load()');
    }
    const priced = priceEvent(ev);

    if (this.#state.seenEventIds.includes(ev.eventId)) {
      this.#opts.logger.debug?.(`ledger: skipping duplicate eventId ${ev.eventId}`);
      return priced;
    }
    this.#rememberEventId(ev.eventId);

    if (priced.unattributed) {
      this.#opts.logger.warn(
        `ledger: UNATTRIBUTED event feature='${ev.feature}' model='${ev.model ?? ''}' reason='${priced.reason ?? ''}' — NOT counted`,
      );
      this.#emit('unattributed', priced);
      return priced;
    }

    const groupId = this.#state.activeGroupId;
    if (!groupId) {
      this.#opts.logger.warn(
        'ledger: no active group set; event priced but not accumulated. call setActiveGroup() first.',
      );
      return priced;
    }

    const g = this.#ensureGroup(groupId);
    if (g.exhausted) {
      // a burst-mode race: bridge is mid-switch. account against the group anyway
      // so post-hoc reconciliation is honest, but the threshold has already fired.
      this.#opts.logger.debug?.(
        `ledger: post-exhaustion event on '${groupId}' (bridge is mid-switch)`,
      );
    }
    const now = ev.timestamp ?? Date.now();
    g.creditsUsed = round4(g.creditsUsed + priced.credits);
    g.eventCount += 1;
    g.lastEventAt = now;
    if (!g.firstEventAt) g.firstEventAt = now;

    this.#emit('eventPriced', priced, g);

    if (!g.thresholdFired && g.creditsUsed >= g.thresholdCredits) {
      g.thresholdFired = true;
      this.#opts.logger.info(
        `ledger: threshold reached on '${groupId}' (${g.creditsUsed.toFixed(2)}/${g.creditsCap}, ` +
          `≥ ${g.thresholdCredits.toFixed(2)}). requesting instant switch.`,
      );
      this.#emit('thresholdReached', { ...g });
    }
    if (!g.exhausted && g.creditsUsed >= g.creditsCap) {
      g.exhausted = true;
      this.#opts.logger.warn(
        `ledger: cap reached on '${groupId}' (${g.creditsUsed.toFixed(2)}/${g.creditsCap}). ` +
          'bridge should have switched already; circuit breaker will cover any next call.',
      );
      this.#emit('capReached', { ...g });
    }

    this.#schedulePersist();
    return priced;
  }

  /**
   * calibrator: the delayed official meter (subscriptionUsage.creditsUsed) is
   * NOT load-bearing but we still want to reconcile drift over long periods.
   * this method is optional and safe to call periodically.
   */
  calibrate(groupId: string, officialCreditsUsed: number): void {
    const g = this.#ensureGroup(groupId);
    const drift = officialCreditsUsed - g.creditsUsed;
    if (Math.abs(drift) < 0.05) return;
    this.#opts.logger.info(
      `ledger: calibrating '${groupId}' local=${g.creditsUsed.toFixed(3)} ` +
        `official=${officialCreditsUsed.toFixed(3)} drift=${drift.toFixed(3)}`,
    );
    // never move BACKWARDS. we only ratchet up: mis-attribution that
    // undercounts is the dangerous direction (blows the cap).
    if (drift > 0) {
      g.creditsUsed = round4(officialCreditsUsed);
      if (!g.thresholdFired && g.creditsUsed >= g.thresholdCredits) {
        g.thresholdFired = true;
        this.#emit('thresholdReached', { ...g });
      }
    }
    this.#schedulePersist();
  }

  /** flush persistence immediately. call on graceful shutdown. */
  async flush(): Promise<void> {
    if (this.#persistTimer) {
      clearTimeout(this.#persistTimer);
      this.#persistTimer = undefined;
    }
    await this.#opts.storage.write(this.#state);
  }

  #ensureGroup(groupId: string): GroupUsageSnapshot {
    let g = this.#state.groups[groupId];
    if (!g) {
      g = {
        groupId,
        creditsUsed: 0,
        creditsCap: this.#opts.perGroupCapCredits,
        thresholdCredits: round4(this.#opts.perGroupCapCredits * this.#opts.thresholdFraction),
        eventCount: 0,
        thresholdFired: false,
        exhausted: false,
      };
      this.#state.groups[groupId] = g;
    }
    return g;
  }

  #rememberEventId(id: string): void {
    this.#state.seenEventIds.push(id);
    const w = this.#opts.seenEventIdWindow;
    if (this.#state.seenEventIds.length > w) {
      this.#state.seenEventIds.splice(0, this.#state.seenEventIds.length - w);
    }
  }

  #schedulePersist(): void {
    if (this.#persistTimer) return;
    this.#persistTimer = setTimeout(() => {
      this.#persistTimer = undefined;
      this.#opts.storage.write(this.#state).catch((err) => {
        this.#opts.logger.warn('ledger: persist failed', err as Error);
      });
    }, this.#opts.persistDebounceMs);
    // don't keep the process alive just for a persist tick.
    (this.#persistTimer as unknown as { unref?: () => void }).unref?.();
  }

  #emit<K extends keyof LedgerEvents>(event: K, ...args: Parameters<LedgerEvents[K]>): void {
    this.#emitter.emit(event, ...(args as unknown[]));
  }
}

function round4(n: number): number {
  return Math.round(n * 10_000) / 10_000;
}
