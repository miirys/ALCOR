import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect, jest } from '@jest/globals';
import { CreditLedger, ThresholdController, type LedgerStorage } from '@gitlab-org/credit-ledger';
import { GroupPoolManager } from '@gitlab-org/lib-pool-bridge';
import { PoolBridgeAdapter } from './pool_bridge_adapter';
import { wireCreditLedgerPoolSwitch } from './credit_ledger_pool_wiring';

const nullLogger = { info() {}, warn() {}, error() {}, debug() {}, cat() {} };

async function newLedger(): Promise<CreditLedger> {
  let state: unknown;
  const storage: LedgerStorage = {
    read: async () => state as never,
    write: async (v) => {
      state = v;
    },
  };
  const ledger = new CreditLedger({
    perGroupCapCredits: 24,
    thresholdFraction: 0.9,
    storage,
    logger: { info() {}, warn() {}, debug() {} },
  });
  await ledger.load();
  return ledger;
}

describe('boot smoke: wireCreditLedgerPoolSwitch with the real GroupPoolManager', () => {
  it('runs without throwing and starts the ThresholdController', async () => {
    const startSpy = jest.spyOn(ThresholdController.prototype, 'start');

    const here = dirname(fileURLToPath(import.meta.url));
    const examplePool = join(here, '../../../lib_pool_bridge/src/groups_pool.example.json');
    const poolManager = new GroupPoolManager({ groupsPoolPath: examplePool }, nullLogger as never);
    const bridge = new PoolBridgeAdapter(poolManager, {
      getCredentials: async () => ({ token: 't', baseUrl: 'https://gitlab.example.com' }),
    });

    const ledger = await newLedger();

    let wired: ReturnType<typeof wireCreditLedgerPoolSwitch> | undefined;
    expect(() => {
      wired = wireCreditLedgerPoolSwitch({
        ledger,
        bridge,
        logger: { info() {}, warn() {}, debug() {} },
      });
    }).not.toThrow();

    expect(startSpy).toHaveBeenCalledTimes(1);
    expect(wired?.thresholdController).toBeInstanceOf(ThresholdController);
    expect(typeof wired?.guard).toBe('function');

    startSpy.mockRestore();
  });
});
