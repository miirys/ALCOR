import type { Command } from 'commander';
import type { DuoCommand, Example } from '../duo_command';
import { tailLastLogFile } from './last_log';

const examples: Example[] = [
  {
    title: 'Follow the last log file',
    exampleCommand: 'duo log tail -f',
  },
  {
    title: 'Show the last 50 lines',
    exampleCommand: 'duo log tail -n 50',
  },
];

export class LogTailCommand implements DuoCommand {
  readonly name = 'tail [args...]';

  readonly description = 'Tail the last log file.';

  readonly synopsis =
    'Extra arguments are forwarded verbatim to the platform `tail` command ' +
    '(or PowerShell `Get-Content` on Windows). The log file path is appended automatically.';

  readonly examples = examples;

  register(node: Command): void {
    // Allow passing arbitrary `tail` flags through to the underlying command.
    node.allowUnknownOption();
    node.action((args: string[] | undefined) => {
      tailLastLogFile(args ?? []);
    });
  }
}
