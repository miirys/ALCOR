import stripAnsi from 'strip-ansi';
import { escapeRegExp } from 'lodash-es';
import { TmuxSession } from './tmux_session';
import { createRecordedSession, type AsciinemaRecordingOptions } from './asciinema_recording';

export interface TmuxTerminalTestOptions extends AsciinemaRecordingOptions {
  /**
   * When enabled, log the terminal state after each `writeText`, `sendKey`,
   * `writeLine` call. Useful for debugging flaky tests.
   */
  trace?: boolean;
}

const waitMs = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

/**
 * Helper class for testing CLI applications using tmux.
 * Provides Playwright-like API for terminal interactions.
 *
 * Uses Node.js child_process instead of Bun's $ shell for compatibility
 * with the monorepo's Jest-based test infrastructure.
 *
 * Every session is wrapped in `asciinema rec` so test runs produce .cast
 * files. On failure, the recording is uploaded for review.
 *
 * Env vars are set via the tmux session's initial command (not typed
 * into the shell). Values never appear in tmux scrollback or recordings.
 *
 * ## Ink `<Static>` and tmux scrollback
 *
 * Ink's `<Static>` component renders items once and never re-renders them.
 * As new items are added, older ones scroll upward out of the visible
 * terminal viewport. tmux keeps a scrollback buffer that retains those
 * lines, so polling/assertion helpers below read it via
 * `capture-pane -S - -E -` and see all `<Static>` content regardless of
 * how far it has scrolled.
 *
 * ### Recommendations
 *
 * - Use `waitForMatch()` / `getFullOutput()` to assert on any rendered
 *   content. They include both the visible screen and tmux scrollback,
 *   so they correctly handle tall dialogs and `<Static>` history.
 * - Use `getOutput()` only when you specifically need the *visible* pane
 *   (e.g., debugging what's on-screen right now). `waitForAbsence()`
 *   reads the visible pane by design — "X is no longer visible".
 * - Use `writeLine()` to type text and press Enter.
 */
export class TmuxTerminalTest {
  #session: TmuxSession;

  #traceEnabled: boolean;

  constructor(shellCommand: string, options: TmuxTerminalTestOptions) {
    const { trace = false, ...recordingOpts } = options;

    this.#traceEnabled = trace;

    const { session } = createRecordedSession(shellCommand, recordingOpts);
    this.#session = session;
  }

  // ── Polling helpers ──────────────────────────────────────────────────────

  /**
   * Wait for a regex pattern to appear in the terminal output.
   *
   * By default, searches the full output including tmux scrollback — use this
   * whenever a test wants to confirm "has X been rendered?", including content
   * that scrolled out of the visible pane (e.g. Ink `<Static>` elements).
   *
   * Pass `{ visibleOnly: true }` to search only the currently visible pane.
   * Use this when you need to confirm content is on-screen *right now*, not
   * just that it appeared at some point in history (e.g. some dynamic content/hint).
   *
   * A `string` pattern is matched literally (regex metacharacters carry no
   * special meaning); pass a `RegExp` when you need pattern matching.
   */
  async waitForMatch(
    pattern: RegExp | string,
    options?: number | { timeout?: number; visibleOnly?: boolean },
  ): Promise<RegExpMatchArray> {
    const matcher = typeof pattern === 'string' ? new RegExp(escapeRegExp(pattern)) : pattern;
    const { timeout, visibleOnly } =
      typeof options === 'number'
        ? { timeout: options, visibleOnly: false }
        : { timeout: options?.timeout, visibleOnly: options?.visibleOnly ?? false };
    const timeoutMs = timeout ?? this.#session.defaultTimeout;
    const startTime = Date.now();
    const pollInterval = 100;

    while (Date.now() - startTime < timeoutMs) {
      const output = visibleOnly ? this.getOutput() : this.getFullOutput();
      const match = output.match(matcher);
      if (match) {
        return match;
      }

      // eslint-disable-next-line no-await-in-loop
      await waitMs(pollInterval);
    }

    this.#dumpOutput(`Timeout waiting for pattern ${pattern} after ${timeoutMs}ms`);
    throw new Error(`Timeout waiting for pattern ${pattern} after ${timeoutMs}ms.`);
  }

  /**
   * Wait until a regex pattern is no longer present in the output.
   */
  async waitForAbsence(pattern: RegExp, timeout?: number): Promise<void> {
    const timeoutMs = timeout ?? this.#session.defaultTimeout;
    const startTime = Date.now();
    const pollInterval = 100;

    while (Date.now() - startTime < timeoutMs) {
      const rawOutput = this.#session.capturePane();
      const output = stripAnsi(rawOutput);

      if (!output.match(pattern)) {
        return;
      }

      // eslint-disable-next-line no-await-in-loop
      await waitMs(pollInterval);
    }

    this.#dumpOutput(`Timeout waiting for absence of pattern ${pattern} after ${timeoutMs}ms`);
    throw new Error(`Timeout waiting for absence of pattern ${pattern} after ${timeoutMs}ms.`);
  }

  // ── Interaction helpers ──────────────────────────────────────────────────

  /**
   * Type text into the terminal without pressing Enter.
   * Useful for filling filter fields or text inputs.
   */
  async writeText(text: string): Promise<void> {
    this.#session.sendKeys(text);
    await waitMs(150);
    this.#trace(`writeText(${JSON.stringify(text)})`);
  }

  /**
   * Write a line to the terminal (appends newline).
   */
  async writeLine(text: string): Promise<void> {
    await this.writeText(text);
    this.#session.sendKey('Enter');
    this.#trace(`writeLine(${JSON.stringify(text)})`);
  }

  /**
   * Send a special key to the terminal.
   */
  async sendKey(key: string): Promise<void> {
    const keyMap: Record<string, string> = {
      escape: 'Escape',
      'ctrl+a': 'C-a',
      'ctrl+c': 'C-c',
      'ctrl+d': 'C-d',
      'ctrl+e': 'C-e',
      'ctrl+j': 'C-j',
      'ctrl+o': 'C-o',
      'ctrl+r': 'C-r',
      'ctrl+left': 'C-Left',
      'ctrl+right': 'C-Right',
      'ctrl+backspace': 'C-BSpace',
      'ctrl+delete': 'C-DC',
      enter: 'Enter',
      up: 'Up',
      down: 'Down',
      left: 'Left',
      right: 'Right',
      backspace: 'BSpace',
      delete: 'DC',
      home: 'Home',
      end: 'End',
      tab: 'Tab',
    };

    const tmuxKey = keyMap[key.toLowerCase()];
    if (!tmuxKey) {
      throw new Error(`Unknown key: ${key}. Available keys: ${Object.keys(keyMap).join(', ')}`);
    }

    this.#session.sendKey(tmuxKey);
    await waitMs(150);
    this.#trace(`sendKey(${JSON.stringify(key)})`);
  }

  /**
   * Send a special key to the terminal multiple times.
   */
  async repeatKey(key: string, count: number): Promise<void> {
    for (let i = 0; i < count; i++) {
      // eslint-disable-next-line no-await-in-loop
      await this.sendKey(key);
    }
  }

  // ── Output helpers ───────────────────────────────────────────────────────

  /**
   * Get the terminal output with ANSI codes stripped.
   */
  getOutput(): string {
    return stripAnsi(this.#session.capturePane());
  }

  /**
   * Get the raw terminal output with ANSI codes.
   */
  getRawOutput(): string {
    return this.#session.capturePane();
  }

  /**
   * Get the full terminal output including scrollback history, with ANSI codes stripped.
   * Unlike `getOutput()` which only returns the visible screen, this captures all content
   * including Ink `<Static>` elements that have scrolled out of view.
   */
  getFullOutput(): string {
    return stripAnsi(this.#session.capturePaneFull());
  }

  /**
   * Get the full raw terminal output including scrollback history, with ANSI codes.
   */
  getRawFullOutput(): string {
    return this.#session.capturePaneFull();
  }

  // ── Lifecycle ────────────────────────────────────────────────────────────

  /**
   * Kill the tmux session and cleanup resources.
   */
  cleanup(): void {
    this.#session.cleanup();
  }

  /**
   * Pause test execution for interactive debugging.
   *
   * Prints the tmux session name and the command to attach to it,
   * then blocks until you press Enter in the test terminal.
   *
   * Usage in a test:
   * ```ts
   * await terminal.debugPause();
   * ```
   *
   * In another terminal, run the printed `tmux attach` command to inspect
   * and interact with the session. Press Enter in the test terminal to resume.
   */
  async debugPause(): Promise<void> {
    await this.#session.debugPause();
  }

  /**
   * Attach to the session for interactive debugging.
   */
  attach(): void {
    this.#session.attach();
  }

  /**
   * Get the session name (useful for debugging)
   */
  getSessionName(): string {
    return this.#session.getSessionName();
  }

  // ── Private helpers ──────────────────────────────────────────────────────

  /**
   * Log the current terminal state when trace mode is enabled.
   */
  #trace(action: string): void {
    if (!this.#traceEnabled) return;

    const output = this.getOutput().trimEnd();
    // eslint-disable-next-line no-console
    console.log(`\n[TRACE] ${action}`);
    // eslint-disable-next-line no-console
    console.log(`--- terminal state ---\n${output}\n--- end ---\n`);
  }

  /**
   * Dump both visible and full scrollback output for debugging on timeout.
   */
  #dumpOutput(reason: string): void {
    const visibleOutput = this.getOutput();
    const fullOutput = this.getFullOutput();
    // eslint-disable-next-line no-console
    console.error(`\n=== VISIBLE TERMINAL OUTPUT (${reason}) ===`);
    // eslint-disable-next-line no-console
    console.error(visibleOutput);
    // eslint-disable-next-line no-console
    console.error('=== END VISIBLE OUTPUT ===\n');
    // eslint-disable-next-line no-console
    console.error('=== FULL SCROLLBACK OUTPUT ===');
    // eslint-disable-next-line no-console
    console.error(fullOutput);
    // eslint-disable-next-line no-console
    console.error('=== END FULL SCROLLBACK OUTPUT ===\n');
  }
}
