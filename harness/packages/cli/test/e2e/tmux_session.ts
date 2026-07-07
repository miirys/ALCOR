import { execSync, spawnSync } from 'child_process';
import { createInterface } from 'readline';

export interface TmuxCreateOptions {
  /** Explicit session name. If omitted, a unique name is auto-generated. */
  sessionName?: string;
  cols?: number;
  rows?: number;
  cwd?: string;
  timeout?: number;
  /**
   * Command to run as the session's initial process.
   *
   * - `string` — passed as a single arg to `tmux new-session` (tmux runs it
   *   through `/bin/sh -c`). Use for simple commands like `'/bin/bash'`.
   * - `string[]` — passed as separate positional args. Use for complex
   *   commands like `['bash', '-c', 'export K=V; exec cmd']` where you
   *   need the shell to parse the script but NOT the `bash` / `-c` tokens.
   *
   * Defaults to `'/bin/bash'`.
   */
  command?: string | string[];
  /** @deprecated Use `command` instead. */
  shell?: string;
}

/**
 * Pure tmux session management — no recording, no polling, no test helpers.
 *
 * Use {@link TmuxSession.create} to start a new tmux session, or
 * the constructor to wrap an existing one by name.
 */
export class TmuxSession {
  #sessionName: string;

  #defaultTimeout: number;

  /**
   * Wrap an existing tmux session by name.
   * The session must already be running.
   */
  constructor(sessionName: string, timeout = 30000) {
    this.#sessionName = sessionName;
    this.#defaultTimeout = timeout;
  }

  /**
   * Create a new tmux session running a command.
   */
  static create(options: TmuxCreateOptions = {}): TmuxSession {
    const {
      sessionName,
      cols = 80,
      rows = 30,
      cwd = process.cwd(),
      timeout = 30000,
      command,
      shell,
    } = options;

    const resolvedCommand = command ?? shell ?? '/bin/bash';
    const name = sessionName ?? `test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const instance = new TmuxSession(name, timeout);
    instance.#initSession(cols, rows, cwd, resolvedCommand);
    return instance;
  }

  /**
   * Check whether a tmux session with the given name is alive.
   */
  static exists(sessionName: string): boolean {
    try {
      execSync(`tmux has-session -t ${TmuxSession.shellEscape(sessionName)} 2>/dev/null`, {
        stdio: 'pipe',
      });
      return true;
    } catch {
      return false;
    }
  }

  get defaultTimeout(): number {
    return this.#defaultTimeout;
  }

  /**
   * Shell-escape a string by wrapping in single quotes.
   */
  static shellEscape(str: string): string {
    return `'${str.replace(/'/g, "'\\''")}'`;
  }

  #initSession(cols: number, rows: number, cwd: string, command: string | string[]): void {
    const commandArgs = Array.isArray(command) ? command : [command];
    const tmuxArgs = [
      'new-session',
      '-d',
      '-s',
      this.#sessionName,
      '-x',
      cols.toString(),
      '-y',
      rows.toString(),
      '-c',
      cwd,
      ...commandArgs,
    ];

    const createResult = spawnSync('tmux', tmuxArgs);
    if (createResult.status !== 0) {
      throw new Error(`Failed to create tmux session: ${createResult.stderr?.toString()}`);
    }
  }

  /**
   * Send a raw command string to the tmux session (followed by Enter).
   */
  sendCommand(commandToRun: string): void {
    const sendResult = spawnSync('tmux', [
      'send-keys',
      '-t',
      this.#sessionName,
      commandToRun,
      'Enter',
    ]);
    if (sendResult.status !== 0) {
      this.cleanup();
      throw new Error(`Failed to send command to tmux session: ${sendResult.stderr?.toString()}`);
    }
  }

  /**
   * Capture the visible terminal screen (no scrollback).
   */
  capturePane(): string {
    return execSync(`tmux capture-pane -t ${this.#sessionName} -p -S 0`, {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
  }

  /**
   * Capture the full terminal output including scrollback history.
   * Essential for seeing Ink `<Static>` content that has scrolled off-screen.
   */
  capturePaneFull(): string {
    return execSync(`tmux capture-pane -t ${this.#sessionName} -p -S - -E -`, {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
  }

  /**
   * Send literal text to the terminal (no Enter appended).
   */
  sendKeys(text: string): void {
    const result = spawnSync('tmux', ['send-keys', '-t', this.#sessionName, '-l', text]);
    if (result.status !== 0) {
      throw new Error(`Failed to send text to tmux session: ${result.stderr?.toString()}`);
    }
  }

  /**
   * Send a tmux key name (e.g. 'Enter', 'Escape', 'C-c').
   */
  sendKey(tmuxKeyName: string): void {
    const result = spawnSync('tmux', ['send-keys', '-t', this.#sessionName, tmuxKeyName]);
    if (result.status !== 0) {
      throw new Error(`Failed to send key to tmux session: ${result.stderr?.toString()}`);
    }
  }

  /**
   * Kill the tmux session.
   */
  cleanup(): void {
    try {
      execSync(`tmux kill-session -t ${this.#sessionName}`, { stdio: 'pipe' });
    } catch {
      // Session might already be dead, ignore
    }
  }

  getSessionName(): string {
    return this.#sessionName;
  }

  /**
   * Attach to the session for interactive debugging.
   */
  attach(): void {
    // eslint-disable-next-line no-console
    console.log(`\nAttaching to tmux session: ${this.#sessionName}`);
    // eslint-disable-next-line no-console
    console.log(`To detach, press Ctrl+B then D\n`);
    spawnSync('tmux', ['attach', '-t', this.#sessionName], {
      stdio: 'inherit',
    });
  }

  /**
   * Pause execution for interactive debugging.
   */
  async debugPause(): Promise<void> {
    const sessionName = this.#sessionName;
    // eslint-disable-next-line no-console
    console.log(`\n╔══════════════════════════════════════════════════╗`);
    // eslint-disable-next-line no-console
    console.log(`║  DEBUG PAUSE                                     ║`);
    // eslint-disable-next-line no-console
    console.log(`╠══════════════════════════════════════════════════╣`);
    // eslint-disable-next-line no-console
    console.log(`║  Session: ${sessionName.padEnd(38)}║`);
    // eslint-disable-next-line no-console
    console.log(`║  Attach:  tmux attach -t ${sessionName.padEnd(24)}║`);
    // eslint-disable-next-line no-console
    console.log(`╠══════════════════════════════════════════════════╣`);
    // eslint-disable-next-line no-console
    console.log(`║  Press Enter here to continue the test...        ║`);
    // eslint-disable-next-line no-console
    console.log(`╚══════════════════════════════════════════════════╝\n`);

    const rl = createInterface({ input: process.stdin, output: process.stdout });
    await new Promise<void>((resolve) => {
      rl.question('', () => {
        rl.close();
        resolve();
      });
    });
  }
}
