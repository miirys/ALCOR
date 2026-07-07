import { CircuitBreaker, isQuotaExhaustedError } from '../circuit_breaker';
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
  l.setActiveGroup('a');
  return l;
}

describe('isQuotaExhaustedError', () => {
  test('recognises 402 and 429', () => {
    expect(isQuotaExhaustedError({ status: 402 })).toBe(true);
    expect(isQuotaExhaustedError({ statusCode: 429 })).toBe(true);
  });
  test('recognises gitlab USAGE_QUOTA_EXCEEDED string', () => {
    expect(isQuotaExhaustedError({ message: 'USAGE_QUOTA_EXCEEDED for namespace foo' })).toBe(true);
  });
  test('recognises the dead-namespace message', () => {
    expect(
      isQuotaExhaustedError({
        message: 'Duo default namespace specified does not allow you to execute a workflow',
      }),
    ).toBe(true);
  });
  test('does not fire on unrelated errors', () => {
    expect(isQuotaExhaustedError({ status: 500 })).toBe(false);
    expect(isQuotaExhaustedError(new Error('timeout'))).toBe(false);
  });
});

describe('CircuitBreaker.guard', () => {
  test('retries once after retargeting on a quota error', async () => {
    const ledger = await makeLedger();
    let calls = 0;
    const cb = new CircuitBreaker({
      ledger,
      logger: silent,
      retargeter: {
        retargetToStandby: async () => 'b',
      },
    });
    const result = await cb.guard(async () => {
      calls += 1;
      if (calls === 1) throw Object.assign(new Error('nope'), { status: 402 });
      return 'ok';
    });
    expect(result).toBe('ok');
    expect(calls).toBe(2);
    expect(ledger.getActiveGroupId()).toBe('b');
    expect(ledger.getSnapshot('a')?.exhausted).toBe(true);
  });

  test('surfaces error unchanged when retarget throws', async () => {
    const ledger = await makeLedger();
    const cb = new CircuitBreaker({
      ledger,
      logger: silent,
      retargeter: {
        retargetToStandby: async () => {
          throw new Error('no standby available');
        },
      },
    });
    await expect(
      cb.guard(async () => {
        throw Object.assign(new Error('nope'), { status: 402 });
      }),
    ).rejects.toThrow('nope');
  });

  test('does not retry non-quota errors', async () => {
    const ledger = await makeLedger();
    let calls = 0;
    const cb = new CircuitBreaker({
      ledger,
      logger: silent,
      retargeter: {
        retargetToStandby: async () => 'b',
      },
    });
    await expect(
      cb.guard(async () => {
        calls += 1;
        throw Object.assign(new Error('boom'), { status: 500 });
      }),
    ).rejects.toThrow('boom');
    expect(calls).toBe(1);
  });
});
