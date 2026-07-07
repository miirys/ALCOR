import { stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { isAbsolute, join, resolve } from 'node:path';
import type { SourceResolver } from './source_resolver';

/** Expand a leading `~` to the user's home directory. */
function expandHome(input: string): string {
  if (input === '~') {
    return homedir();
  }
  if (input.startsWith('~/')) {
    return join(homedir(), input.slice(2));
  }
  return input;
}

/** Directory source: the input (after `~` expansion) is an existing local directory. */
export const resolveDirectorySource: SourceResolver = async (input) => {
  const expanded = expandHome(input);
  const absolute = isAbsolute(expanded) ? expanded : resolve(expanded);
  try {
    const stats = await stat(absolute);
    if (stats.isDirectory()) {
      return { source: 'directory', path: absolute };
    }
  } catch (e) {
    const { code } = e as NodeJS.ErrnoException;
    // A permission error means the path exists but we can't read it. Surface it
    // rather than letting it fall through to the url resolver, which would try
    // to clone the path as a URL and produce a baffling error.
    if (code === 'EACCES' || code === 'EPERM') {
      throw new Error(
        `Cannot access marketplace source "${input}": permission denied (${absolute})`,
      );
    }
    // Anything else (ENOENT, ENOTDIR, …) means "not a local path" — fall through
    // to the next resolver.
  }
  return null;
};
