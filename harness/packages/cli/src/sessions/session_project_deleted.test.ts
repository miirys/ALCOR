import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it, expect, jest } from '@jest/globals';
import type { SessionEvent } from '../backend/backend';
import type { SessionDataService } from './session_data_service';
import { LocalSessionStore } from './local_session_store';
import { LocalFirstSessionDataService } from './local_session_data_service';

const nullLogger = { info() {}, warn() {}, error() {}, debug() {} } as never;
const ev = (n: number): SessionEvent => ({ type: 'text_chunk', n }) as unknown as SessionEvent;

/**
 * End-to-end: a session's transcript survives server-side project deletion.
 * Create a session + write events locally, then a "restart" (fresh store +
 * service instances over the same dir) with an upstream that 404s — rehydrate
 * still succeeds from the local journal.
 */
describe('session survives project deletion', () => {
  it('rehydrates from the local journal after upstream 404 across a restart', async () => {
    const dir = join(await mkdtemp(join(tmpdir(), 'proj-del-')), 'sessions');

    // --- session 1: write turns locally (as ChatSession would mirror them) ---
    {
      const store = new LocalSessionStore({ dir, logger: nullLogger });
      const service = new LocalFirstSessionDataService({ local: store, logger: nullLogger });
      await service.mirrorEvent('sess-1', ev(1), 'Fix the flaky test');
      await service.mirrorEvent('sess-1', ev(2));
      await service.mirrorEvent('sess-1', ev(3));
    }

    // --- restart: the gitlab project was deleted; upstream now 404s ---
    const deletedUpstream: SessionDataService = {
      getSessionMessages: jest.fn<SessionDataService['getSessionMessages']>(async () => {
        throw new Error('GraphQL: project not found (404)');
      }),
      getSessionHistory: jest.fn<SessionDataService['getSessionHistory']>(async () => {
        throw new Error('404');
      }),
    };

    const store2 = new LocalSessionStore({ dir, logger: nullLogger });
    const service2 = new LocalFirstSessionDataService({ local: store2, logger: nullLogger });
    service2.setUpstream(deletedUpstream);

    const events = (await service2.getSessionMessages('sess-1')) as unknown as { n: number }[];
    expect(events.map((e) => e.n)).toEqual([1, 2, 3]);

    // and it still shows up in the (local) history despite the upstream failure.
    const page = await service2.getSessionHistory({});
    const item = page.items.find((i) => i.id === 'sess-1');
    expect(item).toBeDefined();
    expect(item?.title).toContain('(local)');
  });
});
