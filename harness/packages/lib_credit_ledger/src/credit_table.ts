/**
 * gitlab's official credit multiplier table (snapshot).
 *
 * SOURCE: https://gitlab.com/gitlab-org/gitlab/-/raw/master/doc/subscriptions/gitlab_credits.md
 * SNAPSHOT DATE: 2026-07-06 (matches the docs at the time this ledger was built).
 *
 * DO NOT hand-edit the numbers to "tune" the counter. if gitlab publishes an
 * updated table, replace this file's data verbatim and bump SNAPSHOT_VERSION.
 * the whole point of this ledger is that the source of truth for cost is
 * gitlab's table, not our estimates.
 *
 * two shapes of pricing exist:
 *   - variable pricing (models): one llm call = 1/callsPerCredit credits.
 *   - flat pricing (features):   one execution = 1/executionsPerCredit credits
 *     (regardless of the model). self-hosted rows carry a 20% discount.
 *
 * agentic chat is variable-priced by whatever model answered the turn.
 */

export const SNAPSHOT_VERSION = '2026-07-06';
export const SOURCE_URL = 'https://docs.gitlab.com/subscriptions/gitlab_credits/';

/** raw table: model id -> llm calls per one credit. lower = more expensive. */
export const MODEL_CALLS_PER_CREDIT: Record<string, number> = {
  // subsidized / basic integration
  'claude-3-haiku': 8.0,
  'codestral-2501': 8.0,
  'gemini-2.5-flash': 8.0,
  'gpt-5-mini': 8.0,
  'gpt-5-4-nano': 8.0,

  // premium / optimized integration
  'claude-4.5-haiku': 6.7,
  'gpt-5-4-mini': 6.7,
  'gemini-3.5-flash': 3.3,
  'gpt-5': 3.3,
  'gpt-5-codex': 3.3,
  'claude-sonnet-5': 3.2,
  'gpt-5.2': 2.5,
  'gpt-5.2-codex': 2.5,
  'gpt-5.3-codex': 2.5,
  'claude-3.5-sonnet': 2.0,
  'claude-3.7-sonnet': 2.0,
  'claude-sonnet-4.5': 2.0,
  'claude-sonnet-4.6': 2.0,
  // gpt-5.4 has a token-tier split; see MODEL_TIERED below. the base entry
  // is the short-context rate, used when we can't measure prompt size.
  'gpt-5.4': 2.0,
  'claude-opus-4.5': 1.2,
  // claude-opus-4.6 has a token-tier split; base = short-context rate.
  'claude-opus-4.6': 1.2,
  'claude-opus-4.7': 1.1,
  'claude-opus-4.8': 1.1,
  'gpt-5.5': 1.0,
  'claude-fable-5': 0.6,
};

/**
 * models where the multiplier splits by prompt-token count. keys are model ids.
 * `boundaryTokens` is the split point (inclusive of `<=` side).
 */
export const MODEL_TIERED: Record<
  string,
  { boundaryTokens: number; shortCallsPerCredit: number; longCallsPerCredit: number }
> = {
  'claude-opus-4.6': {
    boundaryTokens: 200_000,
    shortCallsPerCredit: 1.2, // per opus 4.6 announcement: <=200k prompts
    longCallsPerCredit: 0.7, //                             >200k prompts
  },
  'gpt-5.4': {
    boundaryTokens: 272_000,
    shortCallsPerCredit: 2.0,
    longCallsPerCredit: 1.11,
  },
  'gpt-5.5': {
    boundaryTokens: 272_000,
    shortCallsPerCredit: 1.0,
    longCallsPerCredit: 0.57,
  },
};

/**
 * any subsidized/compatible self-hosted model that isn't listed above is
 * priced at the flat self-hosted rate of 8 calls per credit per the docs.
 */
export const SELF_HOSTED_FALLBACK_CALLS_PER_CREDIT = 8.0;

/** feature id -> flat executions per credit. tuple is [gitlabManaged, selfHosted]. */
export const FEATURE_EXECUTIONS_PER_CREDIT: Record<string, [number, number]> = {
  code_suggestions: [50, 62.5],
  code_review_flow: [4, 5],
  sast_fp_flow: [1, 1.25],
  sast_vuln_res_flow: [0.25, 0.3125],
};

/**
 * features that are variable-priced (per-llm-call by model), not flat.
 * agentic chat is the canonical case; anything routed through the workflow
 * service that isn't explicitly flat above lands here.
 */
export const VARIABLE_PRICED_FEATURES = new Set(['agentic_chat']);
