import type { Logger } from '@gitlab-org/logging';
import { withPrefix } from '@gitlab-org/logging';
import type { SessionListItem } from '@gitlab-org/tui';
import type { SessionEvent } from '../backend/backend';
import type { SessionDataService } from './session_data_service';
import type { GetSessionHistoryOptions, SessionHistoryPage } from './session_history';
import { LocalSessionStore } from './local_session_store';

const LOCAL_BADGE = ' (local)';

/**
 * Local-first `SessionDataService` (Patch A).
 *
 * Reads prefer the local journal; the GitLab-backed impl is an optional
 * upstream mirror wired via `setUpstream()`. This makes chat history survive
 * server-side project deletion / token loss: `getSessionMessages` returns the
 * local transcript even when upstream 404s.
 *
 * Writes are mirrored into the local store by `ChatSession` as events flow (see
 * `mirrorEvent`); this service also shadow-persists any transcript it has to
 * fetch from upstream so the next read is offline-clean.
 */
export class LocalFirstSessionDataService implements SessionDataService {
  #local: LocalSessionStore;

  #logger: Logger;

  #upstream: SessionDataService | undefined;

  constructor(opts: { local: LocalSessionStore; logger: Logger }) {
    this.#local = opts.local;
    this.#logger = withPrefix(opts.logger, '[LocalFirstSessionData]');
  }

  setUpstream(upstream: SessionDataService): this {
    this.#upstream = upstream;
    return this;
  }

  /** Mirror a single session event into the local journal. */
  async mirrorEvent(sessionId: string, event: SessionEvent, title?: string): Promise<void> {
    try {
      await this.#local.append(sessionId, { kind: 'event', event }, { title });
    } catch (err) {
      this.#logger.warn(`failed to mirror event for '${sessionId}'`, err as Error);
    }
  }

  async getSessionMessages(sessionId: string): Promise<SessionEvent[]> {
    const local = await this.#readLocal(sessionId);
    if (local.length > 0) return local;

    if (!this.#upstream) return local;
    try {
      const remote = await this.#upstream.getSessionMessages(sessionId);
      // shadow-persist so the next read is offline-clean (survives later deletion).
      for (const event of remote) {
        // eslint-disable-next-line no-await-in-loop
        await this.mirrorEvent(sessionId, event);
      }
      return remote;
    } catch (err) {
      // upstream gone (e.g. project 404) — the local journal is the truth.
      this.#logger.warn(`upstream getSessionMessages failed for '${sessionId}'`, err as Error);
      return local;
    }
  }

  async getSessionHistory(options: GetSessionHistoryOptions): Promise<SessionHistoryPage> {
    const localItems = await this.#localHistoryItems();

    if (!this.#upstream) {
      return { items: localItems, pageInfo: emptyPageInfo() };
    }

    try {
      const upstream = await this.#upstream.getSessionHistory(options);
      const upstreamIds = new Set(upstream.items.map((i) => i.id));
      // append local-only sessions (those upstream no longer knows about).
      const localOnly = localItems.filter((i) => !upstreamIds.has(i.id));
      return { items: [...upstream.items, ...localOnly], pageInfo: upstream.pageInfo };
    } catch (err) {
      this.#logger.warn('upstream getSessionHistory failed; local only', err as Error);
      return { items: localItems, pageInfo: emptyPageInfo() };
    }
  }

  async #readLocal(sessionId: string): Promise<SessionEvent[]> {
    const entries = await this.#local.read(sessionId);
    return entries
      .filter((e) => e.kind === 'event' && e.event != null)
      .map((e) => e.event as SessionEvent);
  }

  async #localHistoryItems(): Promise<SessionListItem[]> {
    const sessions = await this.#local.listSessions();
    return sessions.map((s) => ({
      id: s.id,
      title: `${s.title}${LOCAL_BADGE}`,
      status: 'local',
      lastActivity: s.lastActivity,
    }));
  }
}

function emptyPageInfo(): SessionHistoryPage['pageInfo'] {
  return { hasNextPage: false, hasPreviousPage: false };
}
