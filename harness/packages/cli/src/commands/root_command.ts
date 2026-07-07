import { install as installSourceMapSupport } from 'source-map-support';
import type { Command } from 'commander';
import { LOG_LEVEL } from '@gitlab-org/logging';
import { getAppName } from '@gitlab-org/tui';
import { registerOptionsOnCommand } from '../option_def';
import { sharedOptionDefs } from '../shared_option_defs';
import { tuiCommandOptionDefs, runCommandOptionDefs } from '../command_option_defs';
import {
  gitlabSharedOptionDefs,
  gitlabRunOptionDefs,
  anthropicOptionDefs,
} from '../backend_option_defs';
import { GitLabBackendConfigAdapter } from '../backend/gitlab/gitlab_backend_config_adapter';
import type { ExitHandler } from '../utils/exit';
import type { DuoCommand, OptionGroup } from './duo_command';
import { TuiCommand, gitlabTuiExamples, gitlabTuiSynopsis } from './tui/tui_command';
import { RunCommand, gitlabRunExamples, gitlabRunSynopsis } from './run/run_command';
import { DirectGroupCommand, directGroupNotes } from './direct/direct_group_command';
import { VersionCommand } from './version_command';
import { HelpCommand } from './help_command';
import { ConfigGroupCommand } from './config/config_group_command';
import { LogGroupCommand } from './log/log_group_command';
import { PluginGroupCommand } from './plugin/plugin_group_command';

const rootSynopsis =
  'ALCOR ships an interactive terminal UI (TUI) ' +
  'plus auxiliary subcommands for headless workflow runs, configuration, and log management.';

export interface RootCommandOptions {
  version: string;
  exitHandler: ExitHandler;
  /** Reference back to the program — used by `HelpCommand` to print full help. */
  program: Command;
}

/**
 * Root of the command tree (`duo`). Carries metadata for the top-level
 * heading and global options, and owns the list of top-level subcommands.
 *
 * `register(program)` wires program-level commander config (name, version,
 * description, global options, debug pre-action hook). The
 * {@link CommandBootstrapper} should then `attach(program, root.children)`
 * to wire the rest of the tree.
 *
 * The doc generator walks the same instance: it renders root metadata plus
 * `children` recursively.
 */
export class RootCommand implements DuoCommand {
  readonly name = 'duox';

  readonly description =
    'GitLab Duo for your command line.' +
    '\n\nFor detailed feature documentation, see [ALCOR](https://docs.gitlab.com/user/gitlab_duo_cli/).' +
    '\n\n> **Note:** If you use the ALCOR through the GitLab CLI (`glab`), replace `duo` with `glab duo cli` in all examples in this reference.';

  readonly synopsis = rootSynopsis;

  readonly optionGroups: OptionGroup[] = [{ title: 'Global options', options: sharedOptionDefs }];

  readonly children: DuoCommand[];

  readonly #version: string;

  constructor(options: RootCommandOptions) {
    const { version, exitHandler, program } = options;
    this.#version = version;
    const gitlabAdapter = new GitLabBackendConfigAdapter();
    const gitlabSharedOptionDefsArray = Object.values(gitlabSharedOptionDefs);

    this.children = [
      new TuiCommand({
        adapter: gitlabAdapter,
        version,
        exitHandler,
        synopsis: gitlabTuiSynopsis,
        examples: gitlabTuiExamples,
        optionGroups: [
          {
            title: '`tui` options',
            options: [...Object.values(tuiCommandOptionDefs), ...gitlabSharedOptionDefsArray],
          },
        ],
      }),
      new RunCommand({
        adapter: gitlabAdapter,
        version,
        exitHandler,
        examples: gitlabRunExamples,
        synopsis: gitlabRunSynopsis,
        optionGroups: [
          {
            title: '`run` options',
            options: [
              ...Object.values(runCommandOptionDefs),
              ...gitlabSharedOptionDefsArray,
              ...Object.values(gitlabRunOptionDefs),
            ],
          },
        ],
      }),
      new DirectGroupCommand({
        version,
        exitHandler,
        optionGroups: [{ title: 'Anthropic backend options', options: anthropicOptionDefs }],
        notes: directGroupNotes,
      }),
      new VersionCommand(version),
      new HelpCommand(program),
      new ConfigGroupCommand(exitHandler),
      new LogGroupCommand(),
      new PluginGroupCommand(exitHandler),
    ];
  }

  register(program: Command): void {
    program
      .name(getAppName())
      .description(this.description)
      // The version flag is wired here rather than via VersionCommand because
      // commander treats `-v / --version` specially as a top-level flag.
      .version(this.#version, '-v, --version', 'Display version number');

    registerOptionsOnCommand(program, sharedOptionDefs);

    program.hook('preAction', (thisCommand) => {
      const opts = thisCommand.optsWithGlobals();
      if (opts.logLevel === LOG_LEVEL.DEBUG) {
        installSourceMapSupport();
      }
    });
  }
}
