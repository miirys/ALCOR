import { ThresholdController, type PoolBridge } from '../pool_switch_bridge';
import { CreditLedger } from '../ledger';

const silent = { info: () => {}, warn: () => {}, debug: () => {} };

async function makeLedger() {
  let cur: unknown;
  const l = new CreditLedger({
    perGroupCapCredits: 24,
    thresholdFraction: 0.9,
    persistDebounceMs: 0,
    storage: {
      read: async () => cur as never,
      write: async (v) => {
        cur = v;
      },
    },
    logger: silent,
  });
  await l.load();
  return l;
}

test('ThresholdController flips namespace and schedules replacement on threshold', async () => {
  const l = await makeLedger();
  l.setActiveGroup('a');

  const calls: string[] = [];
  const bridge: PoolBridge = {
    getReadyStandby: async () => 'b',
    switchNamespaceTo: async (id) => {
      calls.push(`switch:${id}`);
    },
    scheduleReplacement: (id) => {
      calls.push(`replace:${id}`);
    },
    getActiveGroupId: () => 'a',
  };
  new ThresholdController({ ledger: l, bridge, logger: silent }).start();

  // opus-4.5 (1.2 calls/credit) -> ~0.833 credits each. 26 calls crosses 21.6.
  for (let i = 0; i < 26; i += 1) {
    l.attribute({ eventId: `e${i}`, feature: 'agentic_chat', model: 'claude-opus-4.5' });
  }
  // microtask flush
  await new Promise((r) => {
    setTimeout(r, 0);
  });

  expect(calls).toContain('switch:b');
  expect(calls).toContain('replace:a');
  expect(l.getActiveGroupId()).toBe('b');
  expect(l.getSnapshot('a')?.exhausted).toBe(true);
});

test('does not switch when no standby is ready', async () => {
  const l = await makeLedger();
  l.setActiveGroup('a');
  const bridge: PoolBridge = {
    getReadyStandby: async () => null,
    switchNamespaceTo: async () => {
      throw new Error('should not be called');
    },
    scheduleReplacement: () => {
      throw new Error('should not be called');
    },
    getActiveGroupId: () => 'a',
  };
  new ThresholdController({ ledger: l, bridge, logger: silent }).start();
  for (let i = 0; i < 30; i += 1) {
    l.attribute({ eventId: `e${i}`, feature: 'agentic_chat', model: 'claude-opus-4.5' });
  }
  await new Promise((r) => {
    setTimeout(r, 0);
  });
  expect(l.getActiveGroupId()).toBe('a');
});
