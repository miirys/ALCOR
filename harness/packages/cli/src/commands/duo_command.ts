import type { Command } from 'commander';
import type { OptionDef, OptionDefMap } from '../option_def';

export interface Example {
  title: string;
  exampleCommand: string;
}

export interface OptionGroup {
  title: string;
  options: OptionDefMap | OptionDef[];
}

/**
 * A unit of CLI behaviour: owns its commander registration and its docs metadata.
 *
 * Commands form a tree via the `children` array. The {@link CommandBootstrapper}
 * walks the tree and wires each node onto a commander {@link Command}.
 *
 * Commands marked {@link DuoCommand.isDefaultAction} attach their action to the
 * parent commander instead of creating a child — this models the bare `duo`
 * invocation that launches the TUI.
 */
export interface DuoCommand {
  /**
   * Bare commander name, e.g. `"run"`, `"tail [args...]"`. For a default-action
   * node, use the doc-display name `"(TUI)"` — the bootstrapper does not call
   * `.command()` for default actions, so the value is only consumed by docs.
   */
  name: string;

  description: string;

  hidden?: boolean;

  /** True when this command is the default action on its parent commander. */
  isDefaultAction?: boolean;

  /** Doc-only metadata. */
  synopsis?: string;
  examples?: Example[];
  notes?: string;

  /**
   * Doc-only — option groups rendered in the auto-generated reference.
   * The runtime equivalents must be registered onto the commander node by
   * {@link DuoCommand.register}.
   */
  optionGroups?: OptionGroup[];

  /** Subcommands. The parent owns its children directly. */
  children?: DuoCommand[];

  /**
   * Wire the commander action (and any extra commander config such as
   * `allowUnknownOption`) onto `node`. Called by the bootstrapper after
   * `description` and `optionGroups` have been applied. Group commands without
   * an action of their own leave this as a no-op.
   */
  register(node: Command): void;
}
