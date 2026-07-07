import { mkdirSync } from 'fs';
import { dirname } from 'node:path';
import { TmuxSession, type TmuxCreateOptions } from './tmux_session';

export interface AsciinemaRecordingOptions extends TmuxCreateOptions {
  /** Path to the .cast output file for asciinema recording. */
  castFile: string;
  /** Title embedded in the asciinema recording metadata */
  recordingTitle?: string;
  /** Cap idle time in playback (seconds, default: 2) */
  idleTimeLimit?: number;
}

/**
 * Handle returned by {@link createRecordedSession}.
 */
export interface RecordedSession {
  session: TmuxSession;
}

/**
 * Create a tmux session that records via asciinema.
 *
 * The session's initial command is controlled by the caller via
 * `options.command` (from {@link TmuxCreateOptions}). Callers that need
 * env isolation should pass a pre-built command from
 * {@link buildEnvCommand} — this layer has no env awareness.
 *
 * The asciinema command is sent into the live shell via `sendCommand`,
 * so the shell stays alive after the recorded process exits (important
 * for reading error output from auth failures, etc.).
 *
 * @param shellCommand - A **pre-escaped** shell command string. The caller
 *   is responsible for quoting / escaping individual arguments (e.g. via
 *   {@link TmuxSession.shellEscape}). This allows callers to embed shell
 *   variable references like `"$VAR"` that expand at runtime without
 *   being quoted away.
 */
export function createRecordedSession(
  shellCommand: string,
  options: AsciinemaRecordingOptions,
): RecordedSession {
  const { castFile, recordingTitle, idleTimeLimit = 2, ...sessionOpts } = options;

  const castDir = dirname(castFile);
  mkdirSync(castDir, { recursive: true });

  const escapedCastFile = TmuxSession.shellEscape(castFile);
  const titleArg = recordingTitle ? ` --title ${TmuxSession.shellEscape(recordingTitle)}` : '';

  const session = TmuxSession.create(sessionOpts);

  // Send the asciinema command into the running shell. This appears in
  // scrollback (just the asciinema line, not the env vars) but that's
  // acceptable — callers must ensure no secrets are in shellCommand.
  const asciinemaCmd =
    `asciinema rec --overwrite --idle-time-limit ${idleTimeLimit}` +
    `${titleArg} --command ${TmuxSession.shellEscape(shellCommand)} ${escapedCastFile}`;
  session.sendCommand(asciinemaCmd);

  return { session };
}
