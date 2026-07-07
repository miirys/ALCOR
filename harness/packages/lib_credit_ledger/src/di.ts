import { createInterfaceId, Injectable } from '@gitlab/needle';
import { Logger, withPrefix } from '@gitlab-org/logging';
import { UserPersistentStorage } from '@gitlab-org/persistent-storage';
import { CreditLedger, type LedgerStorage } from './ledger';
import type { LedgerPersistedState } from './types';

/** storage key under UserPersistentStorage. one blob per user. */
const LEDGER_STORAGE_KEY = 'creditLedgerState' as const;

// NOTE: the interface id is typed as the FACTORY (the class bound to it), not
// CreditLedger — consumers resolve the factory and call get(). The supplied
// code typed this as CreditLedger, which does not type-check against needle's
// @Injectable under this repo's tsconfig.
export const CreditLedgerService = createInterfaceId<CreditLedgerFactory>('CreditLedgerService');

// module-level constants: the host repo transpiles decorators with
// @babel/plugin-proposal-decorators v2023-11, under which static class fields
// on a decorated class emit a broken `_initClass` helper. keeping these off the
// class body sidesteps that while preserving the same values.
const PER_GROUP_CAP_CREDITS = 24;
const THRESHOLD_FRACTION = 0.9;

/**
 * DI-friendly wrapper. registers CreditLedger as a singleton, wires it to the
 * existing UserPersistentStorage (same store already used for chat model +
 * selected project preferences), and exposes it under CreditLedgerService.
 *
 * NOTE: the ledger's persisted schema evolves independently of any other keys
 * in UserPersistentStorage. we bump `state.version` in ledger.ts, not schema
 * registration here, so a new ledger version can be rolled out without
 * touching the shared storage schema map.
 */
@Injectable(CreditLedgerService, [UserPersistentStorage, Logger])
export class CreditLedgerFactory {
  #storage: UserPersistentStorage;

  #logger: Logger;

  #instance: CreditLedger | undefined;

  constructor(storage: UserPersistentStorage, logger: Logger) {
    this.#storage = storage;
    this.#logger = withPrefix(logger, '[CreditLedger]');
  }

  async get(): Promise<CreditLedger> {
    if (this.#instance) return this.#instance;
    const ledgerStorage: LedgerStorage = {
      read: async () => {
        // typed as unknown coming out of the generic store; caller validates.
        const v = (await (
          this.#storage as unknown as {
            getGlobal: (k: string) => Promise<unknown>;
          }
        ).getGlobal(LEDGER_STORAGE_KEY)) as LedgerPersistedState | undefined;
        return v && v.version === 1 ? v : undefined;
      },
      write: async (v) => {
        await (
          this.#storage as unknown as {
            setGlobal: (k: string, v: unknown) => Promise<void>;
          }
        ).setGlobal(LEDGER_STORAGE_KEY, v);
      },
    };
    const l = new CreditLedger({
      perGroupCapCredits: PER_GROUP_CAP_CREDITS,
      thresholdFraction: THRESHOLD_FRACTION,
      storage: ledgerStorage,
      logger: {
        info: (m) => this.#logger.info(m),
        warn: (m, e) => this.#logger.warn(m, e),
        debug: (m) => this.#logger.debug?.(m),
      },
    });
    await l.load();
    this.#instance = l;
    return l;
  }
}
