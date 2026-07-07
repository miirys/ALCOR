import { CreditLedger, type LedgerStorage, type PoolBridge } from '@gitlab-org/credit-ledger';
import { wireCreditLedgerPoolSwitch } from './credit_ledger_pool_wiring';

const nullLogger = { info() {}, warn() {}, debug() {} };

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
    thresholdFraction: 0.9, // threshold = 21.6
    storage,
    logger: nullLogger,
  });
  await ledger.load();
  return ledger;
}

/** In-memory PoolBridge fake with a ready standby and call counters. */
class FakePoolBridge implements PoolBridge {
  activeId: string | null = 'group-a';

  standbyId: string | null = 'group-b';

  switchCalls: string[] = [];

  replacements: string[] = [];

  async getReadyStandby(): Promise<string | null> {
    return this.standbyId;
  }

  async switchNamespaceTo(newGroupId: string): Promise<void> {
    this.switchCalls.push(newGroupId);
    this.activeId = newGroupId;
  }

  scheduleReplacement(exhaustedGroupId: string): void {
    this.replacements.push(exhaustedGroupId);
  }

  getActiveGroupId(): string | null {
    return this.activeId;
  }
}

function quotaError() {
  return Object.assign(new Error('USAGE_QUOTA_EXCEEDED'), { status: 402 });
}

describe('wireCreditLedgerPoolSwitch', () => {
  it('fires switchNamespaceTo exactly once when credits cross 21.6', async () => {
    const ledger = await newLedger();
    const bridge = new FakePoolBridge();
    wireCreditLedgerPoolSwitch({ ledger, bridge, logger: nullLogger });

    // gpt-5.5 = 1.0 call/credit => 1 credit per call. 22 calls => 22 credits > 21.6.
    for (let i = 0; i < 22; i += 1) {
      ledger.attribute({ eventId: `e${i}`, feature: 'agentic_chat', model: 'gpt-5.5' });
    }

    // ThresholdController is async (fires on the event); flush microtasks.
    await new Promise((r) => {
      setTimeout(r, 0);
    });

    expect(bridge.switchCalls).toEqual(['group-b']);
    expect(bridge.replacements).toEqual(['group-a']);
    expect(ledger.getActiveGroupId()).toBe('group-b');
    expect(ledger.getSnapshot('group-a')?.exhausted).toBe(true);
  });

  it('circuit breaker retries once silently on a 402 and marks the old group exhausted', async () => {
    const ledger = await newLedger();
    const bridge = new FakePoolBridge();
    ledger.setActiveGroup('group-a');
    const { guard } = wireCreditLedgerPoolSwitch({ ledger, bridge, logger: nullLogger });

    let attempts = 0;
    const result = await guard(async () => {
      attempts += 1;
      if (attempts === 1) throw quotaError();
      return 'ok';
    });

    expect(result).toBe('ok');
    expect(attempts).toBe(2); // original + one silent retry
    expect(bridge.switchCalls).toEqual(['group-b']); // retargeted to funded standby
    expect(bridge.replacements).toEqual(['group-a']); // dead group dropped+replaced
    expect(ledger.getSnapshot('group-a')?.exhausted).toBe(true); // markExhausted
    expect(ledger.getActiveGroupId()).toBe('group-b');
  });
});
