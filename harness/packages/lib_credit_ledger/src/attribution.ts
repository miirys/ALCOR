import {
  FEATURE_EXECUTIONS_PER_CREDIT,
  MODEL_CALLS_PER_CREDIT,
  MODEL_TIERED,
  SELF_HOSTED_FALLBACK_CALLS_PER_CREDIT,
  VARIABLE_PRICED_FEATURES,
} from './credit_table';
import type { FeatureId, PricedEvent, UsageEvent } from './types';

/**
 * price a single usage event against the official credit table.
 *
 * design rules:
 *  - never guess. if we can't map an event to a table row confidently, mark it
 *    `unattributed: true` with `credits: 0` and a reason. the ledger surfaces
 *    unattributed events loudly so mis-attribution (the main failure mode) is
 *    visible instead of silently under- or over-counting.
 *  - variable-priced features REQUIRE a model. flat-priced features IGNORE it.
 *  - self-hosted only affects flat pricing (20% discount already baked into
 *    the second column of the docs table).
 */
export function priceEvent(ev: UsageEvent): PricedEvent {
  const base: PricedEvent = {
    ...ev,
    credits: 0,
    pricingKind: 'variable',
    tableMultiplier: 0,
    unattributed: true,
  };

  if (ev.feature === 'unknown') {
    return { ...base, reason: 'feature=unknown (attribution missed at call site)' };
  }

  if (isFlatFeature(ev.feature)) {
    const row = FEATURE_EXECUTIONS_PER_CREDIT[ev.feature];
    if (!row) {
      return {
        ...base,
        pricingKind: 'flat',
        reason: `no flat row for feature '${ev.feature}'`,
      };
    }
    const executionsPerCredit = ev.selfHosted ? row[1] : row[0];
    if (executionsPerCredit <= 0) {
      return {
        ...base,
        pricingKind: 'flat',
        tableMultiplier: executionsPerCredit,
        reason: 'zero executionsPerCredit in table',
      };
    }
    return {
      ...base,
      credits: 1 / executionsPerCredit,
      pricingKind: 'flat',
      tableMultiplier: executionsPerCredit,
      unattributed: false,
    };
  }

  // variable-priced path
  if (!ev.model) {
    return {
      ...base,
      reason: `variable-priced feature '${ev.feature}' missing model id`,
    };
  }
  const callsPerCredit = callsPerCreditFor(ev.model, ev.selfHosted, ev.promptTokens);
  if (callsPerCredit === null) {
    return {
      ...base,
      reason: `unknown model '${ev.model}' for variable-priced feature '${ev.feature}'`,
    };
  }
  return {
    ...base,
    credits: 1 / callsPerCredit,
    pricingKind: 'variable',
    tableMultiplier: callsPerCredit,
    unattributed: false,
  };
}

export function isFlatFeature(feature: FeatureId): boolean {
  return Boolean(
    !VARIABLE_PRICED_FEATURES.has(feature) && feature !== 'agentic_chat' && feature !== 'unknown',
  );
}

function callsPerCreditFor(
  model: string,
  selfHosted: boolean | undefined,
  promptTokens: number | undefined,
): number | null {
  // self-hosted flat rate for any non-tabled model
  if (selfHosted && !(model in MODEL_CALLS_PER_CREDIT)) {
    return SELF_HOSTED_FALLBACK_CALLS_PER_CREDIT;
  }
  const tier = MODEL_TIERED[model];
  if (tier && typeof promptTokens === 'number' && promptTokens > 0) {
    return promptTokens > tier.boundaryTokens ? tier.longCallsPerCredit : tier.shortCallsPerCredit;
  }
  if (model in MODEL_CALLS_PER_CREDIT) {
    return MODEL_CALLS_PER_CREDIT[model];
  }
  return null;
}
