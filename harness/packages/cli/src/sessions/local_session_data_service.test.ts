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

async function newService() {
  const dir = join(await mkdtemp(join(tmpdir(), 'lfs-')), 'sessions');
  const store = new LocalSessionStore({ dir, logger: nullLogger });
  const service = new LocalFirstSessionDataService({ local: store, logger: nullLogger });
  return { dir, store, service };
}

describe('LocalFirstSessionDataService', () => {
  it('with no upstream, returns the local journal', async () => {
    const { service } = await newService();
    await service.mirrorEvent('s1', ev(1));
    await service.mirrorEvent('s1', ev(2));
    const got = (await service.getSessionMessages('s1')) as unknown as { n: number }[];
    expect(got.map((e) => e.n)).toEqual([1, 2]);
  });

  it('returns local (possibly empty) when upstream throws', async () => {
    const { service } = await newService();
    const upstream: SessionDataService = {
      getSessionMessages: jest.fn<SessionDataService['getSessionMessages']>(async () => {
        throw new Error('404 project not found');
      }),
      getSessionHistory: jest.fn<SessionDataService['getSessionHistory']>(async () => {
        throw new Error('404');
      }),
    };
    service.setUpstream(upstream);
    // local is empty and upstream 404s → empty, not a throw.
    expect(await service.getSessionMessages('missing')).toEqual([]);
  });

  it('shadow-persists an upstream transcript into the local store', async () => {
    const { store, service } = await newService();
    const upstream: SessionDataService = {
      getSessionMessages: jest
        .fn<SessionDataService['getSessionMessages']>()
        .mockResolvedValue([ev(10), ev(11)]),
      getSessionHistory: jest
        .fn<SessionDataService['getSessionHistory']>()
        .mockResolvedValue({ items: [], pageInfo: { hasNextPage: false, hasPreviousPage: false } }),
    };
    service.setUpstream(upstream);

    const first = (await service.getSessionMessages('s9')) as unknown as { n: number }[];
    expect(first.map((e) => e.n)).toEqual([10, 11]);

    // now present locally: a second read comes from disk, upstream not needed.
    const entries = await store.read('s9');
    expect(entries).toHaveLength(2);
    expect(jest.mocked(upstream.getSessionMessages)).toHaveBeenCalledTimes(1);
    await service.getSessionMessages('s9');
    expect(jest.mocked(upstream.getSessionMessages)).toHaveBeenCalledTimes(1); // still 1
  });

  it('merges local-only sessions into history with a (local) badge', async () => {
    const { service } = await newService();
    await service.mirrorEvent('local-only', ev(1), 'My local chat');
    const upstream: SessionDataService = {
      getSessionMessages: jest.fn<SessionDataService['getSessionMessages']>().mockResolvedValue([]),
      getSessionHistory: jest.fn<SessionDataService['getSessionHistory']>().mockResolvedValue({
        items: [{ id: 'remote-1', title: 'Remote', status: 'finished', lastActivity: 'x' }],
        pageInfo: { hasNextPage: false, hasPreviousPage: false },
      }),
    };
    service.setUpstream(upstream);

    const page = await service.getSessionHistory({});
    const ids = page.items.map((i) => i.id);
    expect(ids).toContain('remote-1');
    expect(ids).toContain('local-only');
    expect(page.items.find((i) => i.id === 'local-only')?.title).toContain('(local)');
  });
});
