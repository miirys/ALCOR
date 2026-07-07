import type { Command } from 'commander';
import type { DuoCommand } from '../duo_command';
import { clearLogFiles } from './last_log';

export class LogClearCommand implements DuoCommand {
  readonly name = 'clear';

  readonly description = 'Remove all existing log files.';

  readonly examples = [];

  register(node: Command): void {
    node.action(() => {
      clearLogFiles();
    });
  }
}
