import { createInterfaceId, Implements, Service, ServiceLifetime } from '@gitlab/needle';
import { Logger, withPrefix } from '@gitlab-org/logging';
import { EventEmitterImpl, type Event } from '@gitlab-org/core';
import type { Disposable } from '@gitlab-org/disposable';
import { CliBackend, type SessionEvent } from '../backend/backend';
import { BackendFactory } from '../backend/backend_factory';
import { ChatSession, Session, type SessionEventMirror } from './session';
import { SessionDataService } from './session_data_service';
import type { GetSessionHistoryOptions, SessionHistoryPage } from './session_history';

export interface CreateSessionResult {
  session: Session;
  sessionDetails: SessionDetails;
}

interface SessionDetails {
  sessionRejectionReason?: string;
}

export interface SessionManager extends Disposable {
  createSession(
    existingSessionId?: string,
    opts?: { skipHistoryRehydration?: boolean },
  ): Promise<CreateSessionResult>;
  getActiveSession(): Session | undefined;
  getSessionHistory(options: GetSessionHistoryOptions): Promise<SessionHistoryPage>;
  switchToSession(sessionId: string): Promise<Session>;
  onActiveSessionChanged: Event<Session>;
}

export const SessionManager = createInterfaceId<SessionManager>('SessionManager');

@Implements(SessionManager)
@Service({
  dependencies: [Logger, BackendFactory, SessionDataService],
  lifetime: ServiceLifetime.Singleton,
})
export class DefaultSessionManager implements SessionManager {
  #sessions = new Map<string, Session>();

  #activeSessionId?: string;

  #activeBackend?: CliBackend;

  #sessionDataService: SessionDataService;

  #logger: Logger;

  #backendFactory: BackendFactory;

  #activeSessionChangedEmitter = new EventEmitterImpl<Session>();

  onActiveSessionChanged = this.#activeSessionChangedEmitter.event;

  constructor(
    logger: Logger,
    backendFactory: BackendFactory,
    sessionDataService: SessionDataService,
  ) {
    this.#logger = withPrefix(logger, '[SessionManager]');
    this.#backendFactory = backendFactory;
    this.#sessionDataService = sessionDataService;
  }

  async createSession(
    existingSessionId?: string,
    opts: { skipHistoryRehydration?: boolean } = {},
  ): Promise<CreateSessionResult> {
    const { skipHistoryRehydration = false } = opts;
    const result = await this.#createAndActivateSession(existingSessionId);

    if (existingSessionId && !skipHistoryRehydration && result.session.sessionId) {
      result.session.addInfo('Restoring session...');
      this.#activeSessionChangedEmitter.fire(result.session);
      await this.#rehydrateActiveSession(result.session.sessionId, result.session);
    }

    this.#activeSessionChangedEmitter.fire(result.session);
    return result;
  }

  async #createAndActivateSession(existingSessionId?: string): Promise<CreateSessionResult> {
    this.#activeBackend?.dispose();
    const backend = this.#backendFactory.create();
    this.#activeBackend = backend;
    const { sessionId, sessionRejectionReason } = await backend.initialize(existingSessionId);

    const session = new ChatSession(sessionId, backend, this.#logger, this.#eventMirror());

    this.#sessions.set(session.sessionId, session);
    this.#activeSessionId = session.sessionId;

    this.#logger.debug(`Created session: ${session.sessionId}`);
    return { session, sessionDetails: { sessionRejectionReason } };
  }

  getActiveSession(): Session | undefined {
    if (this.#activeSessionId === undefined) return undefined;
    return this.#sessions.get(this.#activeSessionId);
  }

  async getSessionHistory(options: GetSessionHistoryOptions): Promise<SessionHistoryPage> {
    const search = options.search?.trim() || undefined;
    return this.#sessionDataService.getSessionHistory({ ...options, search });
  }

  async switchToSession(sessionId: string): Promise<Session> {
    this.#cancelActiveSessionIfLoading();
    const { session } = await this.#createAndActivateSession(sessionId);
    await this.#rehydrateActiveSession(sessionId, session);
    this.#activeSessionChangedEmitter.fire(session);
    return session;
  }

  async #rehydrateActiveSession(sessionId: string, session: Session): Promise<void> {
    const events = await this.#sessionDataService.getSessionMessages(sessionId);
    session.rehydrateFromEvents(events);
  }

  dispose(): void {
    this.#activeSessionChangedEmitter.dispose();
  }

  /**
   * Patch A: if the bound SessionDataService supports local mirroring (the
   * LocalFirstSessionDataService does; the anthropic Noop binding does not),
   * hand ChatSession a fire-and-forget mirror into the local journal.
   */
  #eventMirror(): SessionEventMirror | undefined {
    const svc = this.#sessionDataService as SessionDataService & {
      mirrorEvent?: (sessionId: string, event: SessionEvent, title?: string) => Promise<void>;
    };
    if (typeof svc.mirrorEvent !== 'function') return undefined;
    return (sessionId, event, title) => {
      svc.mirrorEvent?.(sessionId, event, title)?.catch((err: Error) => {
        this.#logger.warn(`failed to mirror session event for '${sessionId}'`, err);
      });
    };
  }

  #cancelActiveSessionIfLoading(): void {
    const activeSession = this.getActiveSession();
    if (activeSession?.isLoading) {
      this.#logger.info(
        `Cancelling active session "${activeSession.sessionId}" before switching session.`,
      );
      activeSession.cancelStream();
    }
  }
}
