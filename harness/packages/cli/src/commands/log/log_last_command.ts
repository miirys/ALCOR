import type { Command } from 'commander';
import type { DuoCommand } from '../duo_command';
import { openLastLogFile } from './last_log';

export class LogLastCommand implements DuoCommand {
  readonly name = 'last';

  readonly description = 'Open the last log file in `$EDITOR`.';

  readonly examples = [];

  register(node: Command): void {
    node.action(() => {
      openLastLogFile();
    });
  }
}
