import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it, expect, jest } from '@jest/globals';
import { AgentEventType, UserEventType, type SessionEvent, type CliBackend } from '../backend/backend';
import type { BackendFactory } from '../backend/backend_factory';
import { DefaultSessionManager } from './session_manager';
import type { SessionDataService } from './session_data_service';
import { LocalSessionStore } from './local_session_store';
import { LocalFirstSessionDataService } from './local_session_data_service';

const nullLogger = {
  info() {},
  warn() {},
  error() {},
  debug() {},
} as never;

/** A CliBackend that just echoes the requested session id; no network. */
function fakeBackendFactory(): BackendFactory {
  return {
    create(): CliBackend {
      let id: string | undefined;
      return {
        id: 'test' as never,
        async initialize(existingSessionId?: string) {
          id = existingSessionId ?? 'new-session';
          return { sessionId: id };
        },
        async *sendMessageStream() {
          // no streaming in this test
        },
        getSessionId: () => id,
        dispose() {},
      };
    },
  } as unknown as BackendFactory;
}

/**
 * End-to-end for the /sessions data path (SessionManager -> SessionDataService):
 * a session whose upstream GitLab project was deleted is still LISTED (badged
 * '(local)') and RESTORED from the local journal.
 */
describe('/sessions local recovery', () => {
  async function setup() {
    const dir = join(await mkdtemp(join(tmpdir(), 'sess-recovery-')), 'sessions');
    const store = new LocalSessionStore({ dir, logger: nullLogger });
    const dataService = new LocalFirstSessionDataService({ local: store, logger: nullLogger });
    const sessionManager = new DefaultSessionManager(
      nullLogger,
      fakeBackendFactory(),
      dataService as unknown as SessionDataService,
    );
    return { store, dataService, sessionManager };
  }

  it('lists a local-only session badged (local) and restores it from local when upstream 404s', async () => {
    const { dataService, sessionManager } = await setup();

    // Seed a local session as ChatSession's mirror would: a user turn + an
    // agent reply, both persisted to the local journal.
    const userEvent: SessionEvent = {
      type: UserEventType.UserMessage,
      messageId: 'u1',
      content: 'hello from local',
      timestamp: 1000,
    };
    const agentEvent: SessionEvent = {
      type: AgentEventType.TextChunk,
      messageId: 'a1',
      content: 'restored reply',
      timestamp: 2000,
    };
    await dataService.mirrorEvent('sess-1', userEvent, 'Deleted-project chat');
    await dataService.mirrorEvent('sess-1', agentEvent);

    // Upstream is gone: list + get both 404 (project deleted server-side).
    const deletedUpstream: SessionDataService = {
      getSessionHistory: jest.fn<SessionDataService['getSessionHistory']>(async () => {
        throw new Error('GraphQL: project not found (404)');
      }),
      getSessionMessages: jest.fn<SessionDataService['getSessionMessages']>(async () => {
        throw new Error('GraphQL: project not found (404)');
      }),
    };
    dataService.setUpstream(deletedUpstream);

    // 1) /sessions LISTS it, badged (local), despite the upstream 404.
    const page = await sessionManager.getSessionHistory({});
    const item = page.items.find((i) => i.id === 'sess-1');
    expect(item).toBeDefined();
    expect(item?.title).toContain('(local)');

    // 2) selecting it RESTORES the transcript from the local journal.
    const session = await sessionManager.switchToSession('sess-1');
    const text = session.elements
      .map((el) => (el.type === 'message' ? el.content : ''))
      .join('\n');
    expect(text).toContain('hello from local');
    expect(text).toContain('restored reply');
  });
});
