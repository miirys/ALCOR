import type { Command } from 'commander';
import type { DuoCommand } from './duo_command';

export class VersionCommand implements DuoCommand {
  readonly name = 'version';

  readonly description = 'Show version information.';

  readonly examples = [];

  readonly #version: string;

  constructor(version: string) {
    this.#version = version;
  }

  register(node: Command): void {
    node.action(() => {
      // eslint-disable-next-line no-console
      console.log(this.#version);
    });
  }
}
