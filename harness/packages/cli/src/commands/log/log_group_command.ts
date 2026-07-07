import type { DuoCommand } from '../duo_command';
import { LogLastCommand } from './log_last_command';
import { LogListCommand } from './log_list_command';
import { LogTailCommand } from './log_tail_command';
import { LogClearCommand } from './log_clear_command';

export class LogGroupCommand implements DuoCommand {
  readonly name = 'log';

  readonly description = 'Log management commands.';

  readonly children: DuoCommand[] = [
    new LogLastCommand(),
    new LogListCommand(),
    new LogTailCommand(),
    new LogClearCommand(),
  ];

  // Group command has no action of its own — running `duo log` without a
  // subcommand falls through to commander's default help output.
  register(): void {}
}
