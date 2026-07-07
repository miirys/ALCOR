import { simpleGit } from 'simple-git';

export interface GitCloneOptions {
  /** Repository URL or any spelling git itself accepts. We do not validate its shape. */
  url: string;
  /** Absolute destination directory. Must be empty (git clone populates it). */
  dest: string;
  /** Optional branch or tag to check out. Marketplace sources do not support commit SHAs. */
  ref?: string;
}

/** Result of a successful clone. */
export interface GitCloneResult {
  /** Commit SHA that was checked out (HEAD of the cloned ref). */
  sha: string;
}

/** Thrown when the underlying `git clone` fails. Wraps git's own message with context. */
export class GitCloneError extends Error {
  constructor(url: string, cause: unknown) {
    const detail = cause instanceof Error ? cause.message : String(cause);
    super(`Failed to clone "${url}": ${detail}`);
    this.name = 'GitCloneError';
    this.cause = cause;
  }
}

/**
 * Clone a plugin marketplace git repository using `simple-git`.
 *
 * We deliberately do NOT define what a valid git URL looks like (user input) -
 * `simple-git`'s default unsafe-operations guard blocks the dangerous argument
 * classes (`--upload-pack`, `ext::`, config injection), and git itself is the
 * authority on whether the URL is valid/fetchable. Anything else surfaces as
 * a wrapped error.
 */
export async function gitClone({ url, dest, ref }: GitCloneOptions): Promise<GitCloneResult> {
  const git = simpleGit({
    // Re-permit the env-sourced settings the user already controls in their own
    // shell (argv-based injection stays blocked).
    unsafe: {
      allowUnsafeEditor: true,
      allowUnsafePager: true,
      allowUnsafeAskPass: true,
      allowUnsafeSshCommand: true,
      allowUnsafeCredentialHelper: true,
    },
    // Inherit the full environment (so credential helpers / SSH work), plus
    // GIT_TERMINAL_PROMPT=0 so a repo needing interactive credentials fails fast
    // instead of hanging on a prompt the user cannot see.
  }).env({ ...process.env, GIT_TERMINAL_PROMPT: '0' });
  const options = ref ? ['--depth', '1', '--branch', ref] : ['--depth', '1'];
  try {
    await git.clone(url, dest, options);
    const sha = (await simpleGit(dest).revparse(['HEAD'])).trim();
    return { sha };
  } catch (e) {
    throw new GitCloneError(url, e);
  }
}
