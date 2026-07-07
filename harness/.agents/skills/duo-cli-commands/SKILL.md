---
name: duo-cli-commands
description: Add or modify a Duo CLI command (`duo …`). Covers the DuoCommand interface, how parents own children, where docs metadata lives, registering with CommandBootstrapper, and updating the auto-generated reference.
---

# Adding a Duo CLI command

The Duo CLI (`packages/cli`) builds its commander tree from a tree of `DuoCommand` instances rooted at `RootCommand`. The same instances drive both runtime registration and the auto-generated reference (`packages/cli/docs/cli-reference.md`). There is **no parallel definition** — adding a command is a single edit + one line in the parent's `children` array.

## Mental model

```text
RootCommand (duo)
├── TuiCommand                    (isDefaultAction: true)
├── RunCommand
├── DirectGroupCommand            (hidden)
│   ├── TuiCommand                (anthropic adapter)
│   └── RunCommand                (anthropic adapter)
├── VersionCommand
├── HelpCommand
├── ConfigGroupCommand
│   └── ConfigEditCommand
└── LogGroupCommand
    ├── LogLastCommand
    ├── LogListCommand
    ├── LogTailCommand
    └── LogClearCommand
```

A command class:

- Implements `DuoCommand` from `packages/cli/src/commands/duo_command.ts`.
- Owns its commander wiring inside `register(node: Command)`.
- Owns its docs metadata as plain properties (`synopsis`, `examples`, `optionGroups`, `notes`).
- Lists subcommands as `DuoCommand` instances in `children`.

The bootstrapper (`packages/cli/src/commands/command_bootstrapper.ts`) walks the tree, creates a commander node per command via `parent.command(cmd.name, …).description(…)`, then calls `cmd.register(node)`. Default-action commands skip the `.command(…)` call and attach to the parent commander directly.

## Decide what kind of command you're adding

| Scenario                                                                  | Pattern                                                                                                            |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| New leaf under an existing group (e.g. `duo log foo`)                     | New leaf class + push into the group's `children`.                                                                 |
| New top-level subcommand (e.g. `duo bar`)                                 | New leaf class + add to `RootCommand.children`.                                                                    |
| New top-level group with subcommands (e.g. `duo baz` with `duo baz quux`) | Group class with `children: DuoCommand[]` + leaves + add group to `RootCommand.children`.                          |
| Default action on an existing parent                                      | Set `isDefaultAction: true` and `name: '(...)'`. The parent commander runs the action when no subcommand is given. |

## Step 1 — Write the command class

Place files at `packages/cli/src/commands/<group>/<name>_command.ts`. One class per file. Class name ends with `Command`.

### Leaf command template

```ts
// packages/cli/src/commands/log/log_foo_command.ts
import type { Command } from 'commander';
import type { DuoCommand, Example } from '../duo_command';
import { doSomething } from './do_something';

export class LogFooCommand implements DuoCommand {
  readonly name = 'foo';
  readonly description = 'Do the foo thing.';

  // Doc-only metadata.
  readonly synopsis = 'Optional longer prose describing the command.';
  readonly examples: Example[] = [{ title: 'Run foo', exampleCommand: 'duo log foo --bar baz' }];
  // Use `examples = []` (empty array) for short commands — the doc renderer
  // emits the bare invocation. Omit the field entirely to skip Examples.

  register(node: Command): void {
    // Register options here if any.
    // node.option('--bar <value>', '...');

    node.action(async (...args) => {
      await doSomething(args);
    });
  }
}
```

### Group (parent) command template

A group has no action of its own; it just owns children.

```ts
// packages/cli/src/commands/baz/baz_group_command.ts
import type { DuoCommand } from '../duo_command';
import { BazQuuxCommand } from './baz_quux_command';

export class BazGroupCommand implements DuoCommand {
  readonly name = 'baz';
  readonly description = 'baz management commands';
  readonly children: DuoCommand[] = [new BazQuuxCommand()];

  // No action — running `duo baz` falls through to commander's help output.
  register(): void {}
}
```

The `register()` method is part of the `DuoCommand` interface. For group commands, omit the parameter entirely (the lint config rejects unused `_node` parameters).

### Default-action template

```ts
export class MyDefaultActionCommand implements DuoCommand {
  readonly name = '(MyAction)'; // Display label only — not used by commander
  readonly description = '…';
  readonly isDefaultAction = true;

  register(parentNode: Command): void {
    // `parentNode` is the parent commander (e.g. the root program). The
    // bootstrapper does NOT create a child node for default-action commands.
    parentNode.action(async () => {
      /* … */
    });
  }
}
```

See `packages/cli/src/commands/tui/tui_command.ts` for a real example.

## Step 2 — Register the command in its parent

Open the parent group's file and push your new class into its `children` array.

```ts
// packages/cli/src/commands/log/log_group_command.ts
readonly children: DuoCommand[] = [
  new LogLastCommand(),
  new LogListCommand(),
  new LogTailCommand(),
  new LogClearCommand(),
  new LogFooCommand(),   // ← new
];
```

For a top-level command, edit `RootCommand.children` in `packages/cli/src/commands/root_command.ts`.

That's the entire registration. The bootstrapper picks it up automatically because the tree walk reads `children`.

## Step 3 — Where each piece of metadata lives

Keep metadata co-located with the class that consumes it. The current code follows this rule strictly — do the same for new commands.

- Examples / synopsis describing **how a command behaves** → exported next to that command's class file (see `gitlabTuiExamples` in `tui_command.ts`, `gitlabRunExamples` in `run_command.ts`).
- The **root** synopsis describes the CLI as a whole, not the TUI default action.
- A group's `notes` describes the group itself (e.g. `directGroupNotes`).
- An `optionGroup` whose options apply to multiple children (e.g. backend options under `direct`) lives at the group level, registered once.

If your command class is generic (e.g. parameterised by a backend adapter), accept doc fields as constructor args and pass concrete values from `RootCommand`. Don't hard-code backend-specific text in a generic class.

## Step 4 — Options

Two patterns:

1. **Static option defs** (most common) — define an `OptionDefMap` in `packages/cli/src/{shared,command,backend}_option_defs.ts` (or a new sibling file), then in `register()`:

   ```ts
   import { registerOptionsOnCommand } from '../../option_def';
   import { myOptionDefs } from '../../my_option_defs';

   register(node: Command): void {
     registerOptionsOnCommand(node, myOptionDefs);
     node.action(/* … */);
   }
   ```

   Also add the same defs to the command's `optionGroups` so they appear in docs:

   ```ts
   readonly optionGroups: OptionGroup[] = [
     { title: 'foo options', options: myOptionDefs },
   ];
   ```

   `optionGroups` is **doc-only**. The bootstrapper does not auto-register from it — `register()` must call `registerOptionsOnCommand` itself. Keeping both in sync is the command's responsibility (a single import shared between `optionGroups` and `register` is the easy pattern).

1. **Inline commander options** (`node.option(...)`) — fine for very simple cases. Won't appear in the auto-generated reference unless you also describe them in `optionGroups`.

For options that need runtime context at registration time (e.g. reading `--cwd` from the parent commander), see how `GitLabBackendConfigAdapter.registerOptions` builds `createFlowConfigOptionDef(() => command.parent?.opts().cwd ?? process.cwd())`.

## Step 5 — Hidden / conditional commands

- `readonly hidden = true` — commander hides from `--help`; doc renderer skips the entry entirely.
- Conditional hidden (e.g. only under `glab`): set `hidden` from the constructor, e.g. `readonly hidden = isGlab();`. See `ConfigEditCommand`.

## Step 6 — DI services

Don't put `DuoCommand` classes in DI. They're plain classes, instantiated by the parent (or by `RootCommand`). When the action body needs DI services (TUI, RunController, etc.), it builds a fresh DI container via `initDi(...)` inside the action — see `TuiCommand` / `RunCommand` for the pattern.

If your command needs only a few collaborators (e.g. an `ExitHandler`), accept them as constructor args, the way `ConfigEditCommand` does.

## Step 7 — Regenerate docs and verify

After adding or changing any command, regenerate the reference and run the standard CLI verification.

```bash
bun packages/cli/scripts/gen_docs.ts            # rewrites packages/cli/docs/cli-reference.md
bun packages/cli/scripts/gen_docs.ts --check    # CI-equivalent: fails if drift
./scripts/dev/verify.sh --cli-only              # compile + cli/tui tests + lint
```

CI runs `gen_docs.ts --check`. If you changed any command metadata and forgot to regenerate, the build fails.

## Smoke-check commander help output

The auto-generated reference and `--help` output are independent renderings of the same tree. After registering a new command, sanity-check:

```bash
bun packages/cli/src/index.tsx --help                  # top-level
bun packages/cli/src/index.tsx <parent> --help         # parent group lists your command + description
bun packages/cli/src/index.tsx <parent> <name> --help  # your command's options + usage line
```

## File conventions recap

- One class per file; filename matches `<name>_command.ts` / `<name>_group_command.ts`.
- Use `#`-prefixed private fields, never `public`.
- Doc strings as readonly class properties (`synopsis`, `examples`, `notes`) so they read like data.
- Co-locate examples/synopsis with the class that consumes them; export them when they need to be passed by `RootCommand` into a generic class.

## Key files to read before starting

- `packages/cli/src/commands/duo_command.ts` — the interface you implement.
- `packages/cli/src/commands/command_bootstrapper.ts` — how `register()` is invoked.
- `packages/cli/src/commands/root_command.ts` — top-level composition; where new top-level commands are added.
- `packages/cli/src/commands/log/log_*_command.ts` — simplest leaf+group example.
- `packages/cli/src/commands/tui/tui_command.ts` — default-action + adapter-parameterised example.
- `packages/cli/src/commands/config/config_edit_command.ts` — conditional `hidden` example.
- `packages/cli/scripts/gen_docs.ts` — how the tree is rendered to Markdown.
