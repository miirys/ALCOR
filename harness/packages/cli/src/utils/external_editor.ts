import { spawnSync } from 'node:child_process';
import { statSync } from 'node:fs';
import { win32 as pathWin32 } from 'node:path';
import { parse as parseShellArgs } from 'shell-quote';
import { ok, err, Result } from 'neverthrow';
import { Logger, withPrefix } from '@gitlab-org/logging';

/**
 * Failure modes where the editor never ran, so the file was definitely not
 * edited. A non-zero exit or a signal-cancellation are NOT errors: the editor
 * still ran and may have written the file, so they resolve to `ok`.
 */
export type LaunchEditorError =
  | { kind: 'not_found'; editor: string }
  | { kind: 'spawn_failed'; editor: string; error: Error };

const DEFAULT_PATHEXT = '.COM;.EXE;.BAT;.CMD';

const isWindows = (): boolean => process.platform === 'win32';
const defaultEditor = (): string => (isWindows() ? 'notepad' : 'vi');

/**
 * Resolve the user's preferred editor following POSIX convention:
 * VISUAL (full-screen) > EDITOR (line-mode) > platform default.
 *
 * Parses the value with shell-quote so users can set flags or quoted paths
 * (e.g. `EDITOR='code -w'` or `EDITOR='"C:\Program Files\editor.exe"'`),
 * matching git's behaviour for GIT_EDITOR. Non-string entries from
 * shell-quote (operators like `&&`, glob patterns) are dropped - we
 * intentionally don't expand shell semantics.
 */
export const resolveEditor = (
  env: NodeJS.ProcessEnv = process.env,
): { command: string; args: string[] } => {
  const fallback = defaultEditor();
  const raw = (env.VISUAL || env.EDITOR || fallback).trim();
  const tokens = parseShellArgs(raw).filter((t): t is string => typeof t === 'string');
  const [command = fallback, ...args] = tokens;
  return { command, args };
};

const containsPathSeparator = (cmd: string): boolean => cmd.includes('/') || cmd.includes('\\');

const fileExists = (path: string): boolean => {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
};

/**
 * Locate the absolute path of an executable on the current platform.
 *
 * On POSIX, Node's `spawnSync` already walks `PATH` and only considers files
 * with the executable bit set, so we return the command unchanged and let
 * `spawnSync` do the work.
 *
 * On Windows, `spawnSync` invokes `CreateProcess` directly, which finds
 * `.exe` files on `PATH` but does NOT find `.cmd` / `.bat` / `.ps1` shims.
 * Many editors ship as a shim (`code.cmd`, `code-insiders.cmd`), so a user
 * setting `EDITOR=code` would hit `ENOENT` despite the shim being on `PATH`.
 *
 * Git side-steps this by piping `EDITOR` through its bundled `sh.exe`, which
 * we cannot do safely because the file path we append is not user-trusted
 * (`shell: true` would expose us to command injection).
 *
 * Instead, on Windows we replicate what `where.exe` / npm's `which` package
 * does: walk `PATH`, and for each directory try the bare command followed
 * by each `PATHEXT` extension. Return the first existing file.
 *
 * Returns `null` when no candidate is found (mirrors `which --nothrow`).
 */
export const resolveExecutable = (
  command: string,
  env: NodeJS.ProcessEnv = process.env,
): string | null => {
  if (!isWindows()) {
    return command;
  }

  const extensions = (env.PATHEXT || DEFAULT_PATHEXT)
    .split(pathWin32.delimiter)
    .filter((ext) => ext.length > 0);

  // If the command already ends in a known PATHEXT extension, also try the
  // bare path before appending another extension.
  const candidatesForBase = (base: string): string[] => {
    const lowered = base.toLowerCase();
    const alreadyHasExt = extensions.some((ext) => lowered.endsWith(ext.toLowerCase()));
    return alreadyHasExt
      ? [base, ...extensions.map((ext) => base + ext)]
      : extensions.map((ext) => base + ext);
  };

  // Command contains a path separator -> don't search PATH, just probe extensions
  // against the path as-given.
  if (pathWin32.isAbsolute(command) || containsPathSeparator(command)) {
    for (const candidate of candidatesForBase(command)) {
      if (fileExists(candidate)) {
        return candidate;
      }
    }
    return null;
  }

  // Windows always checks the current working directory first, matching cmd.exe.
  const pathDirs = [process.cwd(), ...(env.PATH || '').split(pathWin32.delimiter)].filter(
    (dir) => dir.length > 0,
  );

  for (const dir of pathDirs) {
    for (const candidate of candidatesForBase(pathWin32.join(dir, command))) {
      if (fileExists(candidate)) {
        return candidate;
      }
    }
  }

  return null;
};

/**
 * Wraps the blocking editor invocation so the surrounding TUI can suspend and
 * restore its TTY modes around it. Defaults to a transparent passthrough for
 * non-TUI callers (e.g. tests).
 */
export type SuspendTty = <T>(fn: () => T) => T;

const noSuspend: SuspendTty = (fn) => fn();

export interface LaunchExternalEditorOptions {
  env?: NodeJS.ProcessEnv;
  /**
   * Runs the blocking `spawnSync` call inside the caller's TTY-suspension
   * boundary. When launched from the TUI, pass `withSuspendedTty` (bound with
   * the kitty-support flag) so the editor receives a clean terminal.
   */
  suspendTty?: SuspendTty;
}

/**
 * Launch the user's external editor to edit `filePath`.
 *
 * Handles editor resolution, argument parsing, Windows PATHEXT probing, and
 * `spawnSync` quirks (which returns `{ error }` instead of throwing on
 * `ENOENT`).
 *
 * The editor must be spawned with `spawnSync`. Its blocking of the event loop
 * is required: it stops the TUI from repainting over the editor. Do not change
 * this to `spawn`/`execFile` or any async variant.
 *
 * Returns `err` only when the editor never ran. A non-zero exit or signal
 * cancellation resolves to `ok` because the file may still have been edited.
 */
export const launchExternalEditor = (
  filePath: string,
  logger: Logger,
  { env = process.env, suspendTty = noSuspend }: LaunchExternalEditorOptions = {},
): Result<void, LaunchEditorError> => {
  const log = withPrefix(logger, '[ExternalEditor]');
  const { command, args } = resolveEditor(env);
  const fullArgs = [...args, filePath];

  const resolvedCommand = resolveExecutable(command, env);
  if (resolvedCommand === null) {
    log.warn(`Editor "${command}" not found in PATH`);
    return err({ kind: 'not_found', editor: command });
  }

  log.info(`Opening ${filePath} with ${resolvedCommand} ${fullArgs.join(' ')}`);

  const result = suspendTty(() => spawnSync(resolvedCommand, fullArgs, { stdio: 'inherit' }));

  if (result.error) {
    const spawnError = result.error as NodeJS.ErrnoException;
    if (spawnError.code === 'ENOENT') {
      log.warn(`Editor "${command}" not found in PATH`);
      return err({ kind: 'not_found', editor: command });
    }
    log.warn(`Failed to spawn editor "${command}": ${spawnError.message}`, spawnError);
    return err({ kind: 'spawn_failed', editor: command, error: spawnError });
  }

  if (result.signal) {
    log.warn(`Editor "${command}" terminated by signal ${result.signal}`);
    return ok();
  }

  const exitCode = result.status ?? 0;
  if (exitCode !== 0) {
    log.warn(`Editor "${command}" exited with code ${exitCode}`);
  }

  return ok();
};
