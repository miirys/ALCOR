import { Implements, Service, ServiceLifetime } from '@gitlab/needle';
import { Logger, withPrefix } from '@gitlab-org/logging';
import { PersistentStorage } from '@gitlab-org/persistent-storage';
import { ApprovalEntry, McpServerApprovalStore } from './types';

const STORAGE_KEY = 'mcpApprovals';
const SCHEMA_VERSION = 1;

interface StorageSchema {
  version: number;
  approvals: Record<string, ApprovalEntry>;
}

function isValidSchema(raw: unknown): raw is StorageSchema {
  return (
    typeof raw === 'object' &&
    raw !== null &&
    'version' in raw &&
    typeof (raw as Record<string, unknown>).version === 'number' &&
    'approvals' in raw &&
    typeof (raw as Record<string, unknown>).approvals === 'object' &&
    (raw as Record<string, unknown>).approvals !== null
  );
}

@Implements(McpServerApprovalStore)
@Service({
  dependencies: [Logger, PersistentStorage],
  lifetime: ServiceLifetime.Singleton,
})
export class PersistentMcpServerApprovalStore implements McpServerApprovalStore {
  #logger: Logger;

  #storage: PersistentStorage;

  // Serializes all store operations. Each is read-modify-write against a single
  // storage key, so concurrent callers (e.g. approving several servers at once via
  // Promise.all) would otherwise read the same baseline and clobber each other's
  // writes — last write wins, losing every decision but the last. Chaining every
  // operation on this promise makes each one observe the previous write.
  #queue: Promise<unknown> = Promise.resolve();

  constructor(logger: Logger, storage: PersistentStorage) {
    this.#logger = withPrefix(logger, '[MCP][ServerApprovalStore]');
    this.#storage = storage;
  }

  /** Run `operation` after all previously-enqueued operations have settled. */
  #enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.#queue.then(operation, operation);
    // Keep the chain alive regardless of whether `operation` resolved or rejected,
    // without surfacing earlier errors to later callers.
    this.#queue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  async lookup(configHash: string): Promise<ApprovalEntry | undefined> {
    return this.#enqueue(async () => {
      try {
        const schema = await this.#readSchema();
        return schema.approvals[configHash];
      } catch (error) {
        this.#logger.error(`Failed to look up approval for hash ${configHash}`, error);
        return undefined;
      }
    });
  }

  async approve(configHash: string): Promise<void> {
    await this.#enqueue(() => this.#upsert(configHash, 'approved'));
  }

  async reject(configHash: string): Promise<void> {
    await this.#enqueue(() => this.#upsert(configHash, 'rejected'));
  }

  async revoke(configHash: string): Promise<void> {
    await this.#enqueue(async () => {
      try {
        const schema = await this.#readSchema();
        if (!(configHash in schema.approvals)) return;
        delete schema.approvals[configHash];
        await this.#writeSchema(schema);
        this.#logger.info(`Revoked approval for hash ${configHash}`);
      } catch (error) {
        this.#logger.error(`Failed to revoke approval for hash ${configHash}`, error);
        throw error;
      }
    });
  }

  async list(): Promise<({ hash: string } & ApprovalEntry)[]> {
    return this.#enqueue(async () => {
      try {
        const schema = await this.#readSchema();
        return Object.entries(schema.approvals).map(([hash, entry]) => ({ hash, ...entry }));
      } catch (error) {
        this.#logger.error('Failed to list approvals', error);
        return [];
      }
    });
  }

  // ---- private helpers ----

  async #readSchema(): Promise<StorageSchema> {
    const raw = await this.#storage.get(STORAGE_KEY);
    if (raw === undefined || raw === null) {
      return { version: SCHEMA_VERSION, approvals: {} };
    }
    if (!isValidSchema(raw)) {
      this.#logger.warn(`Unexpected mcpApprovals schema — resetting. Raw: ${JSON.stringify(raw)}`);
      return { version: SCHEMA_VERSION, approvals: {} };
    }
    // Future: branch on raw.version for migrations
    return raw;
  }

  async #writeSchema(schema: StorageSchema): Promise<void> {
    await this.#storage.set(STORAGE_KEY, schema);
  }

  async #upsert(configHash: string, decision: 'approved' | 'rejected'): Promise<void> {
    try {
      const schema = await this.#readSchema();
      const existing = schema.approvals[configHash];

      schema.approvals[configHash] = {
        ...(existing ?? {}),
        decision,
      };

      await this.#writeSchema(schema);
      this.#logger.info(`Recorded ${decision} for hash ${configHash.slice(0, 8)}…`);
    } catch (error) {
      this.#logger.error(`Failed to record ${decision} for hash ${configHash}`, error);
      throw error;
    }
  }
}
