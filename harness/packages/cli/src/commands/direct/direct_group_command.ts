import type { Command } from 'commander';
import type { DuoCommand, OptionGroup } from '../duo_command';
import { registerOptionsOnCommand } from '../../option_def';
import { sharedOptionDefs } from '../../shared_option_defs';
import { TuiCommand } from '../tui/tui_command';
import { RunCommand } from '../run/run_command';
import { AnthropicBackendConfigAdapter } from '../../backend/anthropic/anthropic_backend_config_adapter';
import type { ExitHandler } from '../../utils/exit';

/**
 * Default explanatory note for the `direct` group. Exported so the root
 * command tree can pass it through unchanged.
 */
export const directGroupNotes =
  '`duo direct` exposes the same `tui` (default) and `run` subcommands as the GitLab backend, with the same TUI / Run options.';

export interface DirectGroupCommandOptions {
  version: string;
  exitHandler: ExitHandler;
  /** Doc-only — option groups rendered for the `direct` heading. */
  optionGroups?: OptionGroup[];
  /** Doc-only — extra notes appended after the option tables. */
  notes?: string;
}

/**
 * Hidden `direct` group that exposes the Anthropic backend.
 *
 * Mirrors the structure of the root `duo` command: the same {@link TuiCommand}
 * (default action) and {@link RunCommand} subcommand, but constructed with
 * the {@link AnthropicBackendConfigAdapter}.
 */
export class DirectGroupCommand implements DuoCommand {
  readonly name = 'direct';

  readonly description = 'Use the direct Anthropic backend';

  readonly hidden = true;

  readonly optionGroups?: OptionGroup[];

  readonly notes?: string;

  readonly children: DuoCommand[];

  constructor(options: DirectGroupCommandOptions) {
    const adapter = new AnthropicBackendConfigAdapter();
    this.optionGroups = options.optionGroups;
    this.notes = options.notes;
    this.children = [
      new TuiCommand({
        adapter,
        version: options.version,
        exitHandler: options.exitHandler,
      }),
      new RunCommand({
        adapter,
        version: options.version,
        exitHandler: options.exitHandler,
      }),
    ];
  }

  register(node: Command): void {
    // The legacy registration installed the global `sharedOptionDefs` on the
    // `direct` commander itself so any option supplied between `duo direct`
    // and the subcommand resolves locally. Preserve that behaviour.
    registerOptionsOnCommand(node, sharedOptionDefs);
  }
}
