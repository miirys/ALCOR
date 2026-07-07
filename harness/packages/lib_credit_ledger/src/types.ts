/** feature id as it appears in gitlab's credit table (or 'unknown'). */
export type FeatureId =
  | 'agentic_chat'
  | 'code_suggestions'
  | 'code_review_flow'
  | 'sast_fp_flow'
  | 'sast_vuln_res_flow'
  | 'unknown';

/** free-form model id string; the table validates. */
export type ModelId = string;

/** flat vs variable-priced. */
export type PricingKind = 'flat' | 'variable';

/**
 * one billable action worth attributing. eventId must be stable across
 * retries of the SAME logical call so the ledger can dedupe.
 */
export interface UsageEvent {
  eventId: string;
  feature: FeatureId;
  model?: ModelId;
  /** for tiered-priced models (opus 4.6, gpt-5.4, gpt-5.5). */
  promptTokens?: number;
  /** true if the request was served by a self-hosted model deployment. */
  selfHosted?: boolean;
  /** epoch ms; ledger defaults to Date.now() when omitted. */
  timestamp?: number;
  /** free-form diagnostic tags — sessionId, workflowId, etc. */
  sessionId?: string;
  workflowId?: string;
}

/** result of pricing one UsageEvent against the table. */
export interface PricedEvent extends UsageEvent {
  /** credits deducted (0 if unattributed). */
  credits: number;
  pricingKind: PricingKind;
  /** table multiplier used: executionsPerCredit (flat) or callsPerCredit (variable). */
  tableMultiplier: number;
  /** true when we couldn't attribute confidently; NOT counted by the ledger. */
  unattributed: boolean;
  /** human-readable explanation when unattributed. */
  reason?: string;
}

/** per-pool-group accumulation snapshot. */
export interface GroupUsageSnapshot {
  groupId: string;
  creditsUsed: number;
  /** cap in effect for this group (24 per the fixed plan). */
  creditsCap: number;
  /** threshold at which switch fires (21.6 for cap=24, threshold=0.9). */
  thresholdCredits: number;
  eventCount: number;
  firstEventAt?: number;
  lastEventAt?: number;
  /** true once the ledger emitted thresholdReached for this group. */
  thresholdFired: boolean;
  /** true once the ledger emitted capReached (or was marked exhausted). */
  exhausted: boolean;
}

/** persisted state shape. bump `version` when schema changes. */
export interface LedgerPersistedState {
  version: 1;
  activeGroupId?: string;
  groups: Record<string, GroupUsageSnapshot>;
  /** bounded LRU of recently-seen eventIds for cross-restart dedupe. */
  seenEventIds: string[];
}
