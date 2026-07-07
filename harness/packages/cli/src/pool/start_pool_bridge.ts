import { homedir } from 'node:os';
import { join } from 'node:path';
import type { Logger } from '@gitlab-org/logging';
import { withPrefix } from '@gitlab-org/logging';
import {
  setWorkflowGuard,
  type CreditLedgerFactory,
  type LedgerLogger,
} from '@gitlab-org/credit-ledger';
import { GroupPoolManager, startLogServer, getLogServerUrl } from '@gitlab-org/lib-pool-bridge';
import type { CredentialProvider } from '../utils/credential_provider';
import { PoolBridgeAdapter } from './pool_bridge_adapter';
import { wireCreditLedgerPoolSwitch } from './credit_ledger_pool_wiring';
import { setPoolBridgeStatus, type PoolGroupStatus } from './pool_bridge_status';

function stateDir(): string {
  const explicit = process.env.DUOX_CLI_STATE_DIR;
  if (explicit) return explicit;
  const stateHome = process.env.XDG_STATE_HOME || join(homedir(), '.local', 'state');
  return join(stateHome, 'duo-cli');
}

function toLedgerLogger(logger: Logger): LedgerLogger {
  return {
    info: (m) => logger.info(m),
    warn: (m, e) => logger.warn(m, e),
    debug: (m) => logger.debug?.(m),
  };
}

/**
 * Start the first-party pool bridge in-process and wire it to the credit
 * ledger's threshold/switch decision. Enabled via the DUOX_POOL_BRIDGE env flag
 * so ordinary CLI invocations (e.g. `duo --help`) don't spin up the pool.
 *
 * Idempotent-ish: constructs GroupPoolManager, binds the real PoolBridgeAdapter,
 * starts the ThresholdController + CircuitBreaker, installs the guard, then
 * kicks GroupPoolManager.init() in the background (it does browser automation,
 * so it must not block boot).
 */
export async function startPoolBridge(deps: {
  ledgerFactory: CreditLedgerFactory;
  credentialProvider: CredentialProvider;
  logger: Logger;
}): Promise<void> {
  const log = withPrefix(deps.logger, '[PoolBridge]');
  try {
    const ledger = await deps.ledgerFactory.get();

    const poolManager = new GroupPoolManager(
      {
        groupsPoolPath: join(stateDir(), 'groups_pool.json'),
        // The ledger is the single source of truth for group fundedness — the
        // pool reads snapshots (exhausted / creditsUsed) instead of scraping.
        ledger: ledger as unknown as ConstructorParameters<typeof GroupPoolManager>[0]['ledger'],
      },
      log as unknown as ConstructorParameters<typeof GroupPoolManager>[1],
    );
    const bridge = new PoolBridgeAdapter(poolManager, deps.credentialProvider);

    const { guard } = wireCreditLedgerPoolSwitch({
      ledger,
      bridge,
      logger: toLedgerLogger(log),
    });

    const creds = deps.credentialProvider as unknown as {
      getCredentials(): Promise<{ token: string; baseUrl: string }>;
    };

    // Per-message gate: before each guarded workflow call, make sure the active
    // group is funded per the ledger — switching to a funded standby if it is
    // exhausted. Then run the ledger's circuit breaker (which, on a 402/quota
    // error, marks the group exhausted, drops+replaces it, and retargets to a
    // funded standby). The ledger is always current, so there's no cache to
    // invalidate on failure.
    const composedGuard = async <T>(fn: () => Promise<T>): Promise<T> => {
      await poolManager.ensureCreditWorthyActiveGroup(creds).catch(() => undefined);
      return guard(fn);
    };
    setWorkflowGuard(composedGuard);

    // Serve the bridge log ring on localhost. Never throws.
    startLogServer(log as unknown as Parameters<typeof startLogServer>[0]);

    // Publish live status for the /pool slash command. Reads the pool state +
    // ledger snapshots on demand (nothing cached), so it's always current.
    setPoolBridgeStatus({
      getSnapshot: () => {
        const state = poolManager.getPoolState();
        const groups = state?.groups ?? [];
        const activeId = state?.currentActiveId ?? null;
        const capDefault = 24;
        const thresholdDefault = 21.6;
        const groupStatuses: PoolGroupStatus[] = groups
          .filter((g) => g.status === 'active' || g.id === activeId)
          .map((g) => {
            const snap = ledger.getSnapshot(g.id);
            const exhausted = snap?.exhausted === true;
            return {
              id: g.id,
              active: g.id === activeId,
              ready:
                g.status === 'active' &&
                g.trialActive === true &&
                g.namespaceSettled === true &&
                !exhausted,
              exhausted,
              creditsUsed: snap?.creditsUsed ?? 0,
              creditsCap: snap?.creditsCap ?? capDefault,
              thresholdCredits: snap?.thresholdCredits ?? thresholdDefault,
            };
          });
        const activeSnap = activeId ? ledger.getSnapshot(activeId) : undefined;
        return {
          logUrl: getLogServerUrl(),
          activeGroupId: activeId,
          groups: groupStatuses,
          creditsCap: activeSnap?.creditsCap ?? capDefault,
          thresholdCredits: activeSnap?.thresholdCredits ?? thresholdDefault,
        };
      },
    });

    // GroupPoolManager.init() discovers/creates pool groups via browser
    // automation — fire-and-forget so it can't block or crash the CLI. Once it
    // settles, run a credit-aware reconcile so the pool starts at 3 funded.
    poolManager
      .init(creds)
      .then(() => poolManager.reconcilePool(creds))
      .catch((err: unknown) => log.warn('pool bridge init/reconcile failed', err as Error));

    log.info('pool bridge started and wired to credit ledger');
  } catch (err) {
    log.warn('failed to start pool bridge', err as Error);
  }
}
