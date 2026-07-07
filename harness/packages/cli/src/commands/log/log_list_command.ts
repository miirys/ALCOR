import type { Command } from 'commander';
import type { DuoCommand } from '../duo_command';
import { listLogFiles } from './last_log';

export class LogListCommand implements DuoCommand {
  readonly name = 'list';

  readonly description = 'Print the paths of all log files.';

  readonly examples = [];

  register(node: Command): void {
    node.action(() => {
      listLogFiles();
    });
  }
}
