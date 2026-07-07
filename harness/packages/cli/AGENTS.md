# `@gitlab/duo-cli`

Terminal CLI for GitLab Duo AI capabilities. Supports interactive TUI (React/Ink) and headless execution modes.

## Build & Test

From inside `packages/cli`:

```bash
mise exec -- bun run build:bundle                  # Production build → dist/index.js
mise exec -- bun run dev:watch                     # Hot reload development (humans only)
mise exec -- bun run test                          # Jest unit tests
mise exec -- bun run compile                       # TypeScript type check
mise exec -- bun run start                         # Build and launch app (TUI process does not exit automatically)
mise exec -- bun run start -- run --goal "example" # build and run headless workflow (process exits when complete)
```

Formatting and linting can be applied from project root commands.

### Dependency resolution in dev vs production

Dev scripts pass `--conditions=_ts-source` to `bun`, so workspace deps resolve to raw TypeScript. Edits hot-reload via `bun --watch` with no rebuild.

Production bundling resolves to each dep's `dist/*.mjs`. Root `cli` / `cli:package` go through Turborepo so deps build first.

## Architecture

**Key structure:**

- `src/index.tsx` - Commander.js CLI entry, command routing
- `src/cli_run_config.ts` - Runtime configuration (single source of truth)
- `src/commands/tui/` - Interactive TUI mode (TUIController)
- `src/commands/run/` - Headless execution mode (RunController)
- `src/backend/` - Backend abstraction layer
- `src/di.ts` - Dependency injection setup (`@gitlab/needle`)

TUI is contained in separate package: `packages/tui`

**Pluggable backends** (`CLI_BACKEND` env var):

- `gitlab` (default): Server-side via GitLab Workflow API
- `anthropic`: Client-side using Anthropic SDK directly

Backend specific concepts should be kept out of controllers and TUI where possible. Backend events are mapped to general data structure for UI layer.

**Event streaming**: Both backends use async generators yielding `AgentEvent` types (TextChunk, ToolStart/Complete, ToolAwaitingApproval, Error).
