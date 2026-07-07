import type { Command } from 'commander';
import { Logger, NullLogger } from '@gitlab-org/logging';
import { isGlab } from '@gitlab-org/tui';
import type { DuoCommand, Example, OptionGroup } from '../duo_command';
import type { BackendConfigAdapter } from '../../backend/backend_config_adapter';
import { initDi } from '../../di';
import { parse } from '../../parse';
import { tuiCommandOptionDefs } from '../../command_option_defs';
import { registerOptionsOnCommand } from '../../option_def';
import { getInteractiveEnvInfo } from '../../utils/environment';
import { CredentialProvider } from '../../utils/credential_provider';
import { renderConfig } from '../config/configuration';
import type { ExitHandler } from '../../utils/exit';
import { renderApp } from './app';
import { TUIController } from './tui_controller';

/**
 * Default examples for the GitLab-backend TUI invocation. Exported so the
 * root command tree can attach them to its TUI child without duplicating
 * the strings.
 */
export const gitlabTuiExamples: Example[] = [
  {
    title: 'Start an interactive chat session',
    exampleCommand: 'duo',
  },
  {
    title: 'Start a session connected to a specific GitLab instance',
    exampleCommand:
      'duo --gitlab-base-url https://gitlab.example.com --gitlab-auth-token glpat-xxxx',
  },
  {
    title: 'Start a session using a specific model',
    exampleCommand: 'duo --model claude_sonnet_4_6',
  },
];

export const gitlabTuiSynopsis =
  'Running `duo` with no subcommand launches the interactive TUI against the GitLab backend. ' +
  'Use `duo run` for non-interactive / headless execution.';

export interface TuiCommandOptions<TBackendOpts> {
  adapter: BackendConfigAdapter<TBackendOpts>;
  version: string;
  exitHandler: ExitHandler;
  description?: string;
  /** Doc-only — examples for the auto-generated reference. */
  examples?: Example[];
  /** Doc-only — synopsis for the auto-generated reference. */
  synopsis?: string;
  /** Doc-only — option groups rendered for this command in the reference. */
  optionGroups?: OptionGroup[];
}

/**
 * The interactive TUI. Attached as the *default action* on its parent
 * commander (root `duo`, or the hidden `direct` group), so a bare `duo` or
 * `duo direct` invocation launches it.
 */
export class TuiCommand<TBackendOpts> implements DuoCommand {
  readonly name = '(interactive terminal UI)';

  readonly description: string;

  readonly isDefaultAction = true;

  readonly examples?: Example[];

  readonly synopsis?: string;

  readonly optionGroups?: OptionGroup[];

  readonly #adapter: BackendConfigAdapter<TBackendOpts>;

  readonly #version: string;

  readonly #exitHandler: ExitHandler;

  constructor(options: TuiCommandOptions<TBackendOpts>) {
    this.#adapter = options.adapter;
    this.#version = options.version;
    this.#exitHandler = options.exitHandler;
    this.description = options.description ?? 'Launch the interactive TUI.';
    this.examples = options.examples;
    this.synopsis = options.synopsis;
    this.optionGroups = options.optionGroups;
  }

  register(node: Command): void {
    // `node` is the parent commander (root program or `direct`) because this
    // is a default-action command.
    registerOptionsOnCommand(node, tuiCommandOptionDefs);
    this.#adapter.registerOptions(node);

    node.action(async () => {
      const allOpts = node.optsWithGlobals();
      const parsed = parse(allOpts, 'tui');
      const backendOpts = this.#adapter.parseOptions(allOpts);
      const envInfo = await getInteractiveEnvInfo();

      const { container, configurationController } = await initDi(
        { logDestination: 'file' },
        parsed,
        this.#version,
        envInfo,
        this.#exitHandler,
        this.#adapter,
        backendOpts,
      );

      // Try glab credential fallback before giving up.
      const credentialProvider = container.getRequiredService(CredentialProvider);
      const { token } = await credentialProvider.getCredentials();

      if (!isGlab() && configurationController.isMissingConfiguration() && !token) {
        renderConfig(configurationController, envInfo, this.#exitHandler, new NullLogger());
        return;
      }

      const controller = container.getRequiredService(TUIController);
      const logger = container.getRequiredService(Logger);
      renderApp(controller, envInfo, this.#exitHandler, logger);
    });
  }
}
