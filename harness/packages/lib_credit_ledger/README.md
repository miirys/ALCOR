# @gitlab-org/credit-ledger

first-party per-action credit ledger + threshold/switch-decision module for
duox-cli. lives inside the client so counting is not a MITM concern.

## what it does

- attributes every ai action to the right `(feature, model)` pair.
- prices it via the official gitlab credit multiplier table (snapshotted in
  `src/credit_table.ts`; source url in that file).
- accumulates per pool group. state persists across restarts via
  `UserPersistentStorage`.
- fires `thresholdReached` at 90% of a fixed 24-credit cap (21.6 credits).
- exposes a `ThresholdController` that flips the preferred namespace on a
  ready standby and schedules replacement of the exhausted group.
- exposes a `CircuitBreaker` that catches 402/429/`USAGE_QUOTA_EXCEEDED`
  errors, silently retargets, and retries once so the user never sees the
  error even if the count drifted.

## what it deliberately does not do

- does not estimate credits. mis-attribution is the primary failure mode, not
  table drift; the table is the source of truth.
- does not use `subscriptionUsage.creditsUsed` or `aiUsageData.all` as a
  switching signal. those are too delayed. `calibrate()` accepts the official
  meter as a slow ratchet-up-only reconciliation input.
- does not create/delete/trial-activate groups. the group factory already
  exists on your side; the ledger only asks the bridge to switch, mark, and
  schedule replacement.

## public surface

```ts
import {
  CreditLedger, // per-group ledger with attribute()/on()/calibrate()/flush()
  CircuitBreaker, // wrap any workflow call for silent retarget+retry
  ThresholdController, // ledger.thresholdReached -> bridge.switch + schedule
  priceEvent, // pure fn: (event) -> priced event (for testing/telemetry)
  CreditLedgerService, // DI interface id
  CreditLedgerFactory, // DI-injectable factory bound to UserPersistentStorage
  isQuotaExhaustedError, // shape check used by the circuit breaker
  type PoolBridge, // the tiny handshake with the in-process bridge
  type UsageEvent,
  type PricedEvent,
  type GroupUsageSnapshot,
} from '@gitlab-org/credit-ledger';
```

## integration checklist (see /integration in the drop)

1. register `CreditLedgerFactory` in `packages/cli/src/di.ts`.
2. resolve the ledger once at cli boot and call `setActiveGroup(...)` with
   the bridge's current active group id.
3. hook `attribute()` at these three call sites:
   - `workflow_event_mapper.ts` / `duo_agent_platform_service.ts`: one
     `attribute` per llm-call event emitted by the DAP stream (variable-priced;
     model comes from the selected chat model).
   - `code suggestions` client (`src/common/suggestion/...`): one `attribute`
     per accepted/emitted suggestion request (feature=`code_suggestions`,
     flat-priced).
   - future flows (code review, sast): one per flow execution.
4. attach `ThresholdController` at boot, wired to your bridge adapter
   implementing `PoolBridge`.
5. wrap every outbound workflow request in `CircuitBreaker.guard()`.

## table snapshot policy

when gitlab updates the docs, replace `src/credit_table.ts` verbatim and bump
`SNAPSHOT_VERSION`. do not "tune" numbers.

## tests

`jest` under `src/__tests__/`. covers pricing (variable/flat/tiered/self-hosted),
dedupe, persistence round-trip, calibration monotonicity, circuit breaker
retry-once + surface-unchanged, and threshold controller happy/no-standby paths.
