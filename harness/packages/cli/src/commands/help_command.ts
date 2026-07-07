import type { Command } from 'commander';
import type { DuoCommand } from './duo_command';

export class HelpCommand implements DuoCommand {
  readonly name = 'help';

  readonly description = 'Display help.';

  readonly examples = [];

  readonly #program: Command;

  constructor(program: Command) {
    this.#program = program;
  }

  register(node: Command): void {
    node.action(() => {
      // eslint-disable-next-line no-console
      console.log(this.#program.helpInformation());
    });
  }
}
