import type { CreditLedger, UsageEvent } from '@gitlab-org/credit-ledger';
import { CreditLedgerFactory } from '@gitlab-org/credit-ledger';
import { Logger, withPrefix } from '@gitlab-org/logging';
import {
  UserPersistentStorage,
  SELECTED_CHAT_MODEL_STORAGE_KEY,
} from '@gitlab-org/persistent-storage';

/**
 * Wires the credit ledger to workflow (agentic chat) events. See
 * `deliverable/integration/01_wiring_workflow_events.md`.
 *
 * Repository drift vs. the wiring guide: this repo's workflow stream does not
 * expose per-chunk `AgentEvent`s (TextChunk / isFirstChunk / callIdx). Instead
 * the service consumes cumulative `newCheckpoint` frames whose `ui_chat_log`
 * carries fully-formed messages (see `extractUiChatLog`). We therefore count
 * one billable llm call per NEW `agent` message and rely on the ledger's own
 * eventId dedupe to ignore the cumulative re-emission of earlier messages.
 *
 * The ledger factory's `get()` is async, so the adapter resolves + caches the
 * ledger lazily; attribution never blocks the hot streaming path and never
 * throws into it.
 */
export class CreditAttributionAdapter {
  #factory: CreditLedgerFactory;

  #storage: UserPersistentStorage;

  #logger: Logger;

  #ledger: CreditLedger | undefined;

  constructor(factory: CreditLedgerFactory, storage: UserPersistentStorage, logger: Logger) {
    this.#factory = factory;
    this.#storage = storage;
    this.#logger = withPrefix(logger, '[CreditAttribution]');
  }

  async #getLedger(): Promise<CreditLedger> {
    if (!this.#ledger) {
      this.#ledger = await this.#factory.get();
    }
    return this.#ledger;
  }

  /**
   * Call once for each workflow stream event that represents a billable llm
   * call. `callId` MUST be stable across retries / cumulative re-emissions of
   * the same logical call so the ledger dedupes it.
   */
  async onLlmCall(args: {
    workflowId: string;
    sessionId: string;
    callId: string;
    promptTokens?: number;
  }): Promise<void> {
    try {
      const model = (await this.#storage.get(SELECTED_CHAT_MODEL_STORAGE_KEY)) as
        | string
        | undefined;
      const ev: UsageEvent = {
        eventId: args.callId,
        feature: 'agentic_chat',
        model,
        promptTokens: args.promptTokens,
        sessionId: args.sessionId,
        workflowId: args.workflowId,
      };
      const ledger = await this.#getLedger();
      const priced = ledger.attribute(ev);
      if (priced.unattributed) {
        // Never pretend it worked. Loud log so mis-attribution surfaces.
        this.#logger.warn(
          `unattributed llm call callId=${args.callId} — ${priced.reason ?? 'unknown reason'}`,
        );
      }
    } catch (err) {
      // Attribution is best-effort telemetry; it must never break a chat turn.
      this.#logger.warn('attribution failed', err as Error);
    }
  }
}
