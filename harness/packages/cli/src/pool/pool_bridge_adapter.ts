import type { PoolBridge } from '@gitlab-org/credit-ledger';

/**
 * The subset of the in-process bridge's `GroupPoolManager` that the ledger
 * adapter drives. See `deliverable/integration/03_wiring_bridge_pool_switch.md`
 * and the bridge additions in `duo-bridge/src/pool_manager.js`
 * (`pickReadyStandby`, `setActiveGroupById`, `deleteAndReplace`).
 *
 * Repository drift: the bridge (`duo-bridge-v0.8.4.3`) is a separate repo that
 * is being folded into duox-cli but is not embedded here yet, so we describe
 * the contract as an interface rather than importing a concrete class. When the
 * bridge is embedded, its `GroupPoolManager` satisfies this shape.
 */
export interface GroupPoolManagerLike {
  getActiveGroup(): { id: string } | null | undefined;
  pickReadyStandby(): Promise<{ id: string } | null | undefined>;
  // return type is intentionally loose (real impl returns Promise<boolean>).
  setActiveGroupById(id: string, creds: unknown): Promise<unknown>;
  deleteAndReplace(id: string, creds: unknown): Promise<unknown>;
}

export class PoolBridgeAdapter implements PoolBridge {
  #pm: GroupPoolManagerLike;

  #credProvider: unknown;

  constructor(pm: GroupPoolManagerLike, credProvider: unknown) {
    this.#pm = pm;
    this.#credProvider = credProvider;
  }

  async getReadyStandby(): Promise<string | null> {
    // MUST NOT return a group whose trial is not activated — the bridge's
    // pickReadyStandby() filters on status/trialActive/namespaceSettled.
    const g = await this.#pm.pickReadyStandby();
    return g?.id ?? null;
  }

  async switchNamespaceTo(newGroupId: string): Promise<void> {
    await this.#pm.setActiveGroupById(newGroupId, this.#credProvider);
  }

  scheduleReplacement(exhaustedGroupId: string): void {
    // fire-and-forget — async, non-blocking. bridge logs its own errors.
    this.#pm.deleteAndReplace(exhaustedGroupId, this.#credProvider).catch(() => undefined);
  }

  getActiveGroupId(): string | null {
    return this.#pm.getActiveGroup()?.id ?? null;
  }
}
