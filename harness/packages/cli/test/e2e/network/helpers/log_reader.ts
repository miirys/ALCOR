import { readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const LOG_DIR = join(tmpdir(), 'gitlab-duo-cli');

/** Delete all CLI log files. Useful before a negative test to ensure
 * {@link waitForLogMatch} only sees output produced by the current run. */
export function clearCliLogs(): void {
  try {
    rmSync(LOG_DIR, { recursive: true, force: true });
  } catch {
    // ignore
  }
}

/**
 * Returns the contents of the most recently-modified CLI log file, or the
 * empty string if no log file exists. Matches {@link getCliLogDir} in
 * src/commands/log/utils.ts.
 */
function readLatestCliLog(): string {
  let entries: string[];
  try {
    entries = readdirSync(LOG_DIR);
  } catch {
    return '';
  }
  const logs = entries
    .map((name) => ({
      name,
      path: join(LOG_DIR, name),
      mtime: statSync(join(LOG_DIR, name)).mtimeMs,
    }))
    .filter((f) => f.name.endsWith('.log'))
    .sort((a, b) => b.mtime - a.mtime);
  if (logs.length === 0) return '';
  try {
    return readFileSync(logs[0].path, 'utf8');
  } catch {
    return '';
  }
}

/**
 * Waits until the latest CLI log file contains a pattern, polling every
 * 500ms up to `timeoutMs`. Returns the match when found, or throws on
 * timeout. Useful when the CLI surfaces errors only via the log file
 * (e.g. silent TLS retry loops during init).
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function waitForLogMatch(pattern: RegExp, timeoutMs = 30_000): Promise<RegExpMatchArray> {
  const deadline = Date.now() + timeoutMs;
  const sleep = (ms: number): Promise<void> =>
    new Promise((r) => {
      setTimeout(r, ms);
    });
  while (Date.now() < deadline) {
    try {
      const contents = readLatestCliLog();
      const m = contents.match(pattern);
      if (m) return m;
    } catch {
      // Continue polling if log read fails (e.g. file removed between readdir and stat)
    }
    // eslint-disable-next-line no-await-in-loop
    await sleep(500);
  }
  throw new Error(`Timeout waiting for log pattern ${pattern} after ${timeoutMs}ms`);
}
