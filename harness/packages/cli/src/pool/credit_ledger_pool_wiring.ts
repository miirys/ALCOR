import {
  CircuitBreaker,
  ThresholdController,
  type CreditLedger,
  type LedgerLogger,
  type PoolBridge,
} from '@gitlab-org/credit-ledger';

/**
 * Boot wiring for the ledger's pool-switch integration, per
 * `deliverable/integration/03_wiring_bridge_pool_switch.md`.
 *
 * Call once at startup, after the pool manager knows its active group. Binds a
 * (real) PoolBridge adapter to the ledger:
 *   - seeds the ledger's active group from the bridge,
 *   - starts the ThresholdController (fires the switch at 21.6/24),
 *   - builds a CircuitBreaker whose guard() wraps outbound workflow calls.
 *
 * Returns the guard plus the ThresholdController/CircuitBreaker so callers (and
 * the boot-smoke test) can assert the controller was started and reuse the
 * guard at dispatch sites.
 */
export function wireCreditLedgerPoolSwitch(opts: {
  ledger: CreditLedger;
  bridge: PoolBridge;
  logger: LedgerLogger;
}): {
  thresholdController: ThresholdController;
  breaker: CircuitBreaker;
  guard: <T>(fn: () => Promise<T>) => Promise<T>;
} {
  const { ledger, bridge, logger } = opts;

  const activeId = bridge.getActiveGroupId();
  if (activeId) ledger.setActiveGroup(activeId);

  const thresholdController = new ThresholdController({ ledger, bridge, logger });
  thresholdController.start();

  const breaker = new CircuitBreaker({
    ledger,
    logger,
    retargeter: {
      // On a 402/quota error the breaker has already marked the active group
      // exhausted in the ledger. Retarget to a funded ready standby AND kick a
      // background drop+replace of the dead group so the pool refills.
      retargetToStandby: async () => {
        const dead = ledger.getActiveGroupId();
        const id = await bridge.getReadyStandby();
        if (!id) throw new Error('no standby ready');
        await bridge.switchNamespaceTo(id);
        if (dead && dead !== id) bridge.scheduleReplacement(dead);
        return id;
      },
    },
  });

  return { thresholdController, breaker, guard: (fn) => breaker.guard(fn) };
}
