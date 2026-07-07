import { stat, utimes, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ACCESSED_MARKER } from './plugin_paths';

export async function pathExists(target: string): Promise<boolean> {
  try {
    await stat(target);
    return true;
  } catch {
    return false;
  }
}

/**
 * Write/refresh the `.accessed` marker inside a cached plugin version dir. Its
 * mtime records the last time the version was needed, so a future GC can age
 * out versions that no consumer has referenced for a while.
 */
export async function touchAccessedMarker(installDir: string): Promise<void> {
  const marker = join(installDir, ACCESSED_MARKER);
  const now = new Date();
  try {
    await utimes(marker, now, now);
  } catch {
    await writeFile(marker, '', { mode: 0o600 });
  }
}
