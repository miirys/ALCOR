import { appendFile, mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it, expect } from '@jest/globals';
import { LocalSessionStore } from './local_session_store';

const nullLogger = { info() {}, warn() {}, error() {}, debug() {} } as never;

async function newStore() {
  const dir = join(await mkdtemp(join(tmpdir(), 'lss-')), 'sessions');
  return { dir, store: new LocalSessionStore({ dir, logger: nullLogger }) };
}

describe('LocalSessionStore', () => {
  it('round-trips appended entries in seq order', async () => {
    const { store } = await newStore();
    await store.append('s1', { kind: 'event', event: { n: 1 } });
    await store.append('s1', { kind: 'event', event: { n: 2 } });
    const got = await store.read('s1');
    expect(got.map((e) => (e.event as { n: number }).n)).toEqual([1, 2]);
    expect(got.map((e) => e.seq)).toEqual([0, 1]);
  });

  it('reads a missing session as empty', async () => {
    const { store } = await newStore();
    expect(await store.read('nope')).toEqual([]);
  });

  it('drops a torn final line but keeps all preceding valid lines', async () => {
    const { dir, store } = await newStore();
    await store.append('s1', { kind: 'event', event: { n: 1 } });
    await store.append('s1', { kind: 'event', event: { n: 2 } });
    // simulate a crash mid-append: a partial JSON fragment on the last line.
    await appendFile(join(dir, 's1.jsonl'), '{"v":1,"seq":2,"kind":"event"', 'utf8');

    const got = await store.read('s1');
    expect(got).toHaveLength(2);
    expect(got.map((e) => (e.event as { n: number }).n)).toEqual([1, 2]);
  });

  it('manifest survives a crash between write and rename (stray .tmp ignored)', async () => {
    const { dir, store } = await newStore();
    await store.append('s1', { kind: 'event', event: { n: 1 } }, { title: 'First' });
    // simulate a crash that left a half-written temp file before the rename.
    await writeFile(join(dir, 'manifest.json.999.tmp'), '{ "s1": { "id": "s1"', 'utf8');

    // the real manifest is intact (rename is atomic), and the store ignores .tmp.
    const sessions = await store.listSessions();
    expect(sessions.map((s) => s.id)).toEqual(['s1']);
    expect(sessions[0].title).toBe('First');
    // manifest.json itself parses cleanly.
    const manifest = JSON.parse(await readFile(join(dir, 'manifest.json'), 'utf8'));
    expect(manifest.s1.id).toBe('s1');
    // a .tmp leftover exists but is not a session file.
    expect((await readdir(dir)).some((f) => f.endsWith('.tmp'))).toBe(true);
  });

  it('listSessions orders by most-recently-active first', async () => {
    const { store } = await newStore();
    await store.append('older', { kind: 'event', t: 1_000, event: {} });
    await store.append('newer', { kind: 'event', t: 5_000, event: {} });
    await store.append('middle', { kind: 'event', t: 3_000, event: {} });
    const ids = (await store.listSessions()).map((s) => s.id);
    expect(ids).toEqual(['newer', 'middle', 'older']);
  });

  it('rejects path-traversal session ids', async () => {
    const { store } = await newStore();
    await expect(store.append('..', { kind: 'event', event: {} })).rejects.toThrow();
  });
});
