import { priceEvent } from '../attribution';
import type { UsageEvent } from '../types';

const e = (o: Partial<UsageEvent>): UsageEvent => ({
  eventId: 'e1',
  feature: 'agentic_chat',
  ...o,
});

describe('priceEvent', () => {
  test('variable-priced: prices claude-sonnet-4.5 at 0.5 credits per call (2 calls/credit)', () => {
    const p = priceEvent(e({ model: 'claude-sonnet-4.5' }));
    expect(p.unattributed).toBe(false);
    expect(p.pricingKind).toBe('variable');
    expect(p.tableMultiplier).toBe(2);
    expect(p.credits).toBeCloseTo(0.5, 5);
  });

  test('variable-priced: subsidized haiku costs 0.125 per call (8 calls/credit)', () => {
    const p = priceEvent(e({ model: 'claude-3-haiku' }));
    expect(p.credits).toBeCloseTo(1 / 8, 5);
  });

  test('tiered model: opus-4.6 above boundary uses long rate', () => {
    const p = priceEvent(e({ model: 'claude-opus-4.6', promptTokens: 250_000 }));
    expect(p.tableMultiplier).toBe(0.7);
    expect(p.credits).toBeCloseTo(1 / 0.7, 3);
  });

  test('tiered model: opus-4.6 at/below boundary uses short rate', () => {
    const p = priceEvent(e({ model: 'claude-opus-4.6', promptTokens: 199_999 }));
    expect(p.tableMultiplier).toBe(1.2);
  });

  test('flat-priced: code_suggestions is 1/50 regardless of model', () => {
    const p = priceEvent({
      eventId: 'x',
      feature: 'code_suggestions',
      model: 'anything-goes',
    });
    expect(p.pricingKind).toBe('flat');
    expect(p.credits).toBeCloseTo(1 / 50, 5);
  });

  test('flat-priced self-hosted gets 20% discount (62.5 executions/credit)', () => {
    const p = priceEvent({
      eventId: 'x',
      feature: 'code_suggestions',
      selfHosted: true,
    });
    expect(p.credits).toBeCloseTo(1 / 62.5, 5);
  });

  test('unknown model on variable-priced feature => unattributed, credits 0', () => {
    const p = priceEvent(e({ model: 'gpt-9000-turbo' }));
    expect(p.unattributed).toBe(true);
    expect(p.credits).toBe(0);
    expect(p.reason).toMatch(/unknown model/);
  });

  test('feature=unknown => unattributed even with a valid model', () => {
    const p = priceEvent({
      eventId: 'x',
      feature: 'unknown',
      model: 'claude-3-haiku',
    });
    expect(p.unattributed).toBe(true);
  });
});
