import { appendFile, mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { Logger } from '@gitlab-org/logging';
import { withPrefix } from '@gitlab-org/logging';

/**
 * Append-only jsonl journal for chat sessions, on local disk (Patch A).
 *
 * Why: today session history lives only server-side; deleting the GitLab
 * project (or retiring a pool group) wipes the transcript. This store keeps a
 * local-first copy so history survives independently of the backend.
 *
 * Layout under <stateDir>/sessions/:
 *   <sessionId>.jsonl   one appended line per event — no rewrite, no compaction
 *   manifest.json       session index (title / lastActivity) for the list view
 *
 * State dir resolution: DUOX_CLI_STATE_DIR, else $XDG_STATE_HOME/duo-cli, else
 * ~/.local/state/duo-cli.
 */
export interface SessionEntry {
  /** monotonic per-session sequence; the reader sorts on it. */
  seq: number;
  /** epoch ms. */
  t: number;
  /** free-form caller tag, e.g. 'event' | 'meta'. */
  kind: string;
  [k: string]: unknown;
}

export interface ManifestEntry {
  id: string;
  title: string;
  /** ISO timestamp of the last appended entry. */
  lastActivity: string;
  /** epoch ms mirror of lastActivity, used for ordering. */
  updatedAtMs: number;
}

const LINE_VERSION = 1;
const MANIFEST_NAME = 'manifest.json';

export function resolveStateDir(): string {
  const explicit = process.env.DUOX_CLI_STATE_DIR;
  if (explicit) return explicit;
  const stateHome = process.env.XDG_STATE_HOME || join(homedir(), '.local', 'state');
  return join(stateHome, 'duo-cli');
}

export function resolveSessionsDir(): string {
  return join(resolveStateDir(), 'sessions');
}

// trust boundary: sessionId becomes a filename. strip anything that could
// escape the sessions dir or collide across ids.
function safeName(sessionId: string): string {
  const cleaned = sessionId.replace(/[^A-Za-z0-9._-]/g, '_');
  if (!cleaned || cleaned === '.' || cleaned === '..') {
    throw new Error(`invalid sessionId: ${JSON.stringify(sessionId)}`);
  }
  return `${cleaned}.jsonl`;
}

export class LocalSessionStore {
  #dir: string;

  #logger: Logger;

  #ensured = false;

  /** per-session next sequence number, seeded lazily from disk. */
  #seq = new Map<string, number>();

  constructor(opts: { dir?: string; logger: Logger }) {
    this.#dir = opts.dir ?? resolveSessionsDir();
    this.#logger = withPrefix(opts.logger, '[LocalSessionStore]');
  }

  /** Append one entry and update the manifest. seq/t are auto-filled if omitted. */
  async append(
    sessionId: string,
    // Note: not Omit<SessionEntry, ...> — the index signature makes Omit
    // collapse the named keys, losing `kind` from the spread below.
    entry: { kind: string; seq?: number; t?: number; [k: string]: unknown },
    meta?: { title?: string },
  ): Promise<void> {
    await this.#ensureDir();
    const seq = entry.seq ?? (await this.#nextSeq(sessionId));
    const t = entry.t ?? Date.now();
    const full: SessionEntry = { ...entry, seq, t };
    const line = `${JSON.stringify({ v: LINE_VERSION, ...full })}\n`;
    await appendFile(join(this.#dir, safeName(sessionId)), line, 'utf8');
    await this.#touchManifest(sessionId, t, meta?.title);
  }

  /**
   * Reconstruct a session. Append-only means only the FINAL line can be torn by
   * a crash mid-write, so a bad final line is dropped silently; a bad non-final
   * line is a real corruption and is skipped with a warning.
   */
  async read(sessionId: string): Promise<SessionEntry[]> {
    let raw: string;
    try {
      raw = await readFile(join(this.#dir, safeName(sessionId)), 'utf8');
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw err;
    }
    const lines = raw.split('\n').filter((l) => l.length > 0);
    const out: SessionEntry[] = [];
    for (let i = 0; i < lines.length; i += 1) {
      try {
        out.push(JSON.parse(lines[i]) as SessionEntry);
      } catch {
        if (i === lines.length - 1) {
          // torn final line from a crash mid-append — expected, drop quietly.
          this.#logger.debug?.(`dropping torn final line in session '${sessionId}'`);
        } else {
          this.#logger.warn(`skipping corrupt jsonl line ${i} in session '${sessionId}'`);
        }
      }
    }
    out.sort((a, b) => a.seq - b.seq);
    return out;
  }

  /** Sessions from the manifest, most-recently-active first. */
  async listSessions(): Promise<ManifestEntry[]> {
    const manifest = await this.#readManifest();
    return Object.values(manifest).sort((a, b) => b.updatedAtMs - a.updatedAtMs);
  }

  /** Bare session ids present on disk (journal files). */
  async list(): Promise<string[]> {
    try {
      const files = await readdir(this.#dir);
      return files.filter((f) => f.endsWith('.jsonl')).map((f) => f.slice(0, -'.jsonl'.length));
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw err;
    }
  }

  async has(sessionId: string): Promise<boolean> {
    const manifest = await this.#readManifest();
    return sessionId in manifest;
  }

  /** local delete is explicit — only when the user removes a session on purpose. */
  async remove(sessionId: string): Promise<void> {
    await rm(join(this.#dir, safeName(sessionId)), { force: true });
    const manifest = await this.#readManifest();
    if (manifest[sessionId]) {
      delete manifest[sessionId];
      await this.#writeManifest(manifest);
    }
  }

  async #nextSeq(sessionId: string): Promise<number> {
    if (!this.#seq.has(sessionId)) {
      const existing = await this.read(sessionId);
      const max = existing.reduce((m, e) => Math.max(m, e.seq), -1);
      this.#seq.set(sessionId, max + 1);
    }
    const next = this.#seq.get(sessionId) ?? 0;
    this.#seq.set(sessionId, next + 1);
    return next;
  }

  async #touchManifest(sessionId: string, t: number, title?: string): Promise<void> {
    const manifest = await this.#readManifest();
    const prev = manifest[sessionId];
    manifest[sessionId] = {
      id: sessionId,
      title: title ?? prev?.title ?? sessionId,
      lastActivity: new Date(t).toISOString(),
      updatedAtMs: t,
    };
    await this.#writeManifest(manifest);
  }

  async #readManifest(): Promise<Record<string, ManifestEntry>> {
    try {
      const raw = await readFile(join(this.#dir, MANIFEST_NAME), 'utf8');
      return JSON.parse(raw) as Record<string, ManifestEntry>;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return {};
      // A torn manifest must not wedge the store; start fresh (the journals are
      // the source of truth and can rebuild it).
      this.#logger.warn('manifest unreadable; starting a fresh index');
      return {};
    }
  }

  // Atomic write: serialize to a temp file, then rename over the target. A crash
  // between write and rename leaves the OLD manifest intact (rename is atomic on
  // POSIX), never a half-written one.
  async #writeManifest(manifest: Record<string, ManifestEntry>): Promise<void> {
    await this.#ensureDir();
    const target = join(this.#dir, MANIFEST_NAME);
    const tmp = `${target}.${process.pid}.tmp`;
    await writeFile(tmp, JSON.stringify(manifest, null, 2), 'utf8');
    await rename(tmp, target);
  }

  async #ensureDir(): Promise<void> {
    if (this.#ensured) return;
    await mkdir(this.#dir, { recursive: true });
    this.#ensured = true;
  }
}
