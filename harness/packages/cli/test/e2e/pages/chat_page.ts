import { TmuxSession } from '../tmux_session';
import { TmuxTerminalTest } from '../terminal_test_helper';
import {
  getCompiledBinaryPath,
  createTestEnv,
  buildEnvCommand,
  INPUT_PLACEHOLDER,
} from '../test_utils';
import { DoctorPanel } from './doctor_panel';
import { HistorySearchPanel } from './history_search_panel';
import { McpPanel } from './mcp_panel';
import { SessionsPanel } from './sessions_panel';
import { SettingsPanel } from './settings_panel';
import { type CliTestOptions, cliOptionsToArgs } from './cli_test_options';

export interface ChatPageLaunchOptions {
  subcommand?: string;
  cliOptions?: CliTestOptions;
  env?: Record<string, string>;
  cols?: number;
  rows?: number;
  /** Working directory the CLI process is launched in. Defaults to the test's cwd. */
  cwd?: string;
  /** Path to the .cast output file for asciinema recording. */
  castFile: string;
  /** Title embedded in the asciinema recording metadata */
  recordingTitle?: string;
  /**
   * When true, pass `gitlabAuthToken` as a `--gitlab-auth-token` CLI flag
   * instead of the default `GITLAB_TOKEN` env var. Only use this in tests
   * that explicitly verify flag-based auth resolution.
   *
   * @default false
   */
  tokenViaFlag?: boolean;
  /**
   * Override the executable used to launch the CLI. Defaults to
   * `getCompiledBinaryPath()` (the compiled binary).
   */
  executable?: string;
  /**
   * Args placed before the subcommand. Defaults to `[]`.
   * Only needed when launching via `node dist/index.js` (pass
   * `['dist/index.js']` and set executable to `'node'`).
   */
  prependArgs?: string[];
}

export class ChatPage {
  static readonly #DEFAULT_CLI_OPTIONS: CliTestOptions = {
    model: 'claude_haiku_4_5_20251001',
  };

  static readonly #INITIALIZING = /Initializing/;

  static readonly #WELCOME = /User: @\w+/;

  static readonly #INPUT_PLACEHOLDER = INPUT_PLACEHOLDER;

  static readonly #DUO_RESPONSE = /●/;

  static readonly #LOADING = /GitLab Duo is thinking/;

  static readonly #ESC_CANCEL_HINT = /Esc to cancel/;

  static readonly #ESC_CONFIRM_HINT = /Esc again to confirm cancel/;

  static readonly #SLASH_DROPDOWN = /to select.*to apply/;

  static readonly #AGENT_INDICATOR = (mode: string) => new RegExp(`${mode}.*tab to switch`);

  #terminal: TmuxTerminalTest;

  get terminal(): TmuxTerminalTest {
    return this.#terminal;
  }

  // eslint-disable-next-line no-restricted-syntax
  private constructor(terminal: TmuxTerminalTest) {
    this.#terminal = terminal;
  }

  static launch(options: ChatPageLaunchOptions): ChatPage {
    const {
      subcommand,
      cliOptions = {},
      env,
      cols,
      rows,
      cwd,
      castFile,
      recordingTitle,
      tokenViaFlag = false,
      executable = getCompiledBinaryPath(),
      prependArgs,
    } = options;
    const mergedCliOptions = { ...ChatPage.#DEFAULT_CLI_OPTIONS, ...cliOptions };

    // By default, pass the auth token via GITLAB_TOKEN env var so it never
    // appears in tmux scrollback or asciinema recordings.
    // When tokenViaFlag is true (for testing flag-based auth), the token is
    // passed via a shell variable reference ($__DUO_TEST_TOKEN) so the
    // literal value still stays out of scrollback and recordings.
    let resolvedEnv = env ?? createTestEnv();
    let tokenShellRef: string | undefined;
    if (mergedCliOptions.gitlabAuthToken) {
      if (tokenViaFlag) {
        // Expose the token as an env var; the CLI flag will reference it.
        resolvedEnv = { ...resolvedEnv, __DUO_TEST_TOKEN: mergedCliOptions.gitlabAuthToken };
        tokenShellRef = '"$__DUO_TEST_TOKEN"';
      } else {
        resolvedEnv = { ...resolvedEnv, GITLAB_TOKEN: mergedCliOptions.gitlabAuthToken };
      }
      delete mergedCliOptions.gitlabAuthToken;
    }

    const args = [...(prependArgs ?? [])];
    if (subcommand) args.push(subcommand);
    args.push(...cliOptionsToArgs(mergedCliOptions));

    // Build the shell command string. Each arg is single-quoted for safety,
    // except the token variable reference which must expand at runtime.
    const escapedParts = [executable, ...args].map((a) => TmuxSession.shellEscape(a));
    if (tokenShellRef) {
      escapedParts.push(TmuxSession.shellEscape('--gitlab-auth-token'), tokenShellRef);
    }
    const shellCommand = escapedParts.join(' ');

    const terminal = new TmuxTerminalTest(shellCommand, {
      command: buildEnvCommand(resolvedEnv),
      timeout: 30000,
      cols,
      rows,
      cwd,
      castFile,
      recordingTitle,
    });

    return new ChatPage(terminal);
  }

  async waitForInitialisation(): Promise<void> {
    await this.#terminal.waitForMatch(ChatPage.#INITIALIZING);
    await this.#terminal.waitForAbsence(ChatPage.#INITIALIZING);
  }

  async waitForWelcomeMessage(): Promise<void> {
    await this.#terminal.waitForMatch(ChatPage.#WELCOME);
  }

  async waitForInputReady(): Promise<void> {
    await this.#terminal.waitForMatch(ChatPage.#INPUT_PLACEHOLDER);
  }

  async waitForLoadingIndicator(timeout?: number): Promise<void> {
    await this.#terminal.waitForMatch(ChatPage.#LOADING, timeout);
  }

  async waitForEscCancelHint(timeout?: number): Promise<void> {
    await this.#terminal.waitForAbsence(ChatPage.#ESC_CONFIRM_HINT, timeout);
    await this.#terminal.waitForMatch(ChatPage.#ESC_CANCEL_HINT, { timeout, visibleOnly: true });
  }

  async waitForEscConfirmHint(timeout?: number): Promise<void> {
    await this.#terminal.waitForMatch(ChatPage.#ESC_CONFIRM_HINT, { timeout, visibleOnly: true });
  }

  async waitForEscConfirmHintAbsence(timeout?: number): Promise<void> {
    await this.#terminal.waitForAbsence(ChatPage.#ESC_CONFIRM_HINT, timeout);
  }

  async sendMessage(text: string): Promise<void> {
    await this.#terminal.writeLine(text);
  }

  /**
   * Switch the active agent mode (`plan`/`build`) by pressing Tab to cycle
   * modes. Tab is only honoured while the text input is focused and Duo is
   * not loading, so each press is retried until the indicator reflects the
   * requested mode.
   */
  async switchAgentMode(mode: 'build' | 'plan', timeout = 60_000): Promise<void> {
    const pattern = ChatPage.#AGENT_INDICATOR(mode);
    const start = Date.now();

    while (Date.now() - start < timeout) {
      if (pattern.test(this.#terminal.getOutput())) return;
      // eslint-disable-next-line no-await-in-loop
      await this.waitForInputReady();
      // eslint-disable-next-line no-await-in-loop
      await this.#terminal.sendKey('tab');
      // eslint-disable-next-line no-await-in-loop
      await new Promise((resolve) => {
        setTimeout(resolve, 500);
      });
    }

    await this.#terminal.waitForMatch(pattern, { timeout: 2_000, visibleOnly: true });
  }

  async waitForDuoResponse(pattern?: RegExp, timeout?: number): Promise<void> {
    await this.#terminal.waitForMatch(ChatPage.#DUO_RESPONSE, timeout);
    if (pattern) {
      await this.#terminal.waitForMatch(pattern, timeout);
    }
    await this.#terminal.waitForAbsence(ChatPage.#LOADING, timeout);
    await this.waitForInputReady();
  }

  async submitSlashCommand(command: string): Promise<void> {
    await this.#terminal.waitForMatch(ChatPage.#INPUT_PLACEHOLDER);
    await this.#terminal.writeText(command);
    await this.#terminal.waitForMatch(ChatPage.#SLASH_DROPDOWN);
    await this.#terminal.sendKey('Enter');
    await this.#terminal.waitForAbsence(ChatPage.#SLASH_DROPDOWN);
    await this.#terminal.sendKey('Enter');
  }

  async openSessionsPanel(): Promise<SessionsPanel> {
    await this.submitSlashCommand('/sessions');
    return new SessionsPanel(this);
  }

  async openDoctorPanel(): Promise<DoctorPanel> {
    await this.submitSlashCommand('/doctor');
    const panel = new DoctorPanel(this);
    await panel.waitForOpen();
    return panel;
  }

  async openSettingsPanel(): Promise<SettingsPanel> {
    await this.#terminal.waitForMatch(ChatPage.#INPUT_PLACEHOLDER);
    await this.#terminal.writeLine('/settings');
    const panel = new SettingsPanel(this);
    await panel.waitForOpen();
    return panel;
  }

  async openMcpPanel(): Promise<McpPanel> {
    await this.submitSlashCommand('/mcp');
    const panel = new McpPanel(this);
    await panel.waitForOpen();
    return panel;
  }

  async openHistorySearch(): Promise<HistorySearchPanel> {
    await this.waitForInputReady();
    await this.#terminal.sendKey('ctrl+r');
    const panel = new HistorySearchPanel(this);
    await panel.waitForOpen();
    return panel;
  }

  cleanup(): void {
    this.#terminal.cleanup();
  }
}
