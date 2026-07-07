import { CreditLedger, type LedgerStorage } from '../ledger';
import type { LedgerPersistedState } from '../types';

function memStorage(seed?: LedgerPersistedState): {
  storage: LedgerStorage;
  peek: () => LedgerPersistedState | undefined;
} {
  let cur: LedgerPersistedState | undefined = seed;
  return {
    storage: {
      read: async () => cur,
      write: async (v) => {
        cur = JSON.parse(JSON.stringify(v));
      },
    },
    peek: () => cur,
  };
}

const silent = {
  info: () => {},
  warn: () => {},
  debug: () => {},
};

describe('CreditLedger', () => {
  test('accumulates credits and fires thresholdReached exactly once at 21.6/24', async () => {
    const m = memStorage();
    const l = new CreditLedger({
      perGroupCapCredits: 24,
      thresholdFraction: 0.9,
      persistDebounceMs: 0,
      storage: m.storage,
      logger: silent,
    });
    await l.load();
    l.setActiveGroup('duo-pool-a');

    let firedCount = 0;
    l.on('thresholdReached', () => {
      firedCount += 1;
    });

    // opus-4.5 = 1.2 calls/credit => ~0.8333 credits/call.
    // 26 calls * 0.8333 = 21.66 -> should cross the 21.6 threshold.
    for (let i = 0; i < 26; i += 1) {
      l.attribute({ eventId: `e${i}`, feature: 'agentic_chat', model: 'claude-opus-4.5' });
    }
    // a second batch must NOT re-fire.
    for (let i = 26; i < 30; i += 1) {
      l.attribute({ eventId: `e${i}`, feature: 'agentic_chat', model: 'claude-opus-4.5' });
    }

    expect(firedCount).toBe(1);
    const snap = l.getActiveSnapshot();
    expect(snap?.thresholdFired).toBe(true);
    expect(snap?.creditsUsed).toBeGreaterThan(21.6);
  });

  test('duplicate eventIds are deduped', async () => {
    const m = memStorage();
    const l = new CreditLedger({
      perGroupCapCredits: 24,
      thresholdFraction: 0.9,
      persistDebounceMs: 0,
      storage: m.storage,
      logger: silent,
    });
    await l.load();
    l.setActiveGroup('g');
    l.attribute({ eventId: 'dup', feature: 'agentic_chat', model: 'claude-3-haiku' });
    l.attribute({ eventId: 'dup', feature: 'agentic_chat', model: 'claude-3-haiku' });
    l.attribute({ eventId: 'dup', feature: 'agentic_chat', model: 'claude-3-haiku' });
    expect(l.getActiveSnapshot()?.eventCount).toBe(1);
  });

  test('unattributed events are NOT counted but are emitted', async () => {
    const m = memStorage();
    const l = new CreditLedger({
      perGroupCapCredits: 24,
      thresholdFraction: 0.9,
      persistDebounceMs: 0,
      storage: m.storage,
      logger: silent,
    });
    await l.load();
    l.setActiveGroup('g');
    let missed = 0;
    l.on('unattributed', () => {
      missed += 1;
    });
    l.attribute({ eventId: '1', feature: 'agentic_chat' }); // no model
    l.attribute({ eventId: '2', feature: 'agentic_chat', model: 'nope' });
    expect(missed).toBe(2);
    expect(l.getActiveSnapshot()?.creditsUsed).toBe(0);
  });

  test('state persists across restart', async () => {
    const m = memStorage();
    const l1 = new CreditLedger({
      perGroupCapCredits: 24,
      thresholdFraction: 0.9,
      persistDebounceMs: 0,
      storage: m.storage,
      logger: silent,
    });
    await l1.load();
    l1.setActiveGroup('g1');
    for (let i = 0; i < 5; i += 1) {
      l1.attribute({ eventId: `x${i}`, feature: 'agentic_chat', model: 'claude-sonnet-4.5' });
    }
    await l1.flush();

    const l2 = new CreditLedger({
      perGroupCapCredits: 24,
      thresholdFraction: 0.9,
      persistDebounceMs: 0,
      storage: m.storage,
      logger: silent,
    });
    await l2.load();
    const snap = l2.getSnapshot('g1');
    expect(snap?.eventCount).toBe(5);
    expect(snap?.creditsUsed).toBeCloseTo(2.5, 3);
    // dedupe survives restart
    l2.setActiveGroup('g1');
    l2.attribute({ eventId: 'x0', feature: 'agentic_chat', model: 'claude-sonnet-4.5' });
    expect(l2.getSnapshot('g1')?.eventCount).toBe(5);
  });

  test('calibrate only ratchets up, never down', async () => {
    const m = memStorage();
    const l = new CreditLedger({
      perGroupCapCredits: 24,
      thresholdFraction: 0.9,
      persistDebounceMs: 0,
      storage: m.storage,
      logger: silent,
    });
    await l.load();
    l.setActiveGroup('g');
    l.attribute({ eventId: 'a', feature: 'agentic_chat', model: 'claude-sonnet-4.5' });
    const before = l.getActiveSnapshot()!.creditsUsed;
    l.calibrate('g', before - 5); // pretend the delayed meter is lower
    expect(l.getActiveSnapshot()!.creditsUsed).toBe(before);
    l.calibrate('g', before + 3);
    expect(l.getActiveSnapshot()!.creditsUsed).toBeCloseTo(before + 3, 3);
  });
});
