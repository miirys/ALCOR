import type { Command } from 'commander';
import type { DuoCommand } from './duo_command';

/**
 * Walks a tree of {@link DuoCommand}s and attaches each node to a commander
 * {@link Command} program. The structure of the tree (parent/child links) is
 * the sole source of truth — there is no separate registry or DI lookup.
 *
 * Runtime option registration is delegated to each command's `register()`
 * method, which keeps the bootstrapper agnostic about how options are
 * composed (e.g. backend adapters, dynamic defaults).
 */
export class CommandBootstrapper {
  /** Attach each top-level command to `program`. */
  attach(program: Command, commands: DuoCommand[]): void {
    for (const cmd of commands) {
      this.#attachOne(program, cmd);
    }
  }

  #attachOne(parent: Command, cmd: DuoCommand): void {
    // Default-action commands piggy-back on the parent commander — no child
    // node is created. This models the bare `duo` invocation that launches
    // the TUI.
    if (cmd.isDefaultAction) {
      cmd.register(parent);
      return;
    }

    const node = parent
      .command(cmd.name, cmd.hidden ? { hidden: true } : undefined)
      .description(cmd.description);

    cmd.register(node);

    for (const child of cmd.children ?? []) {
      this.#attachOne(node, child);
    }
  }
}
