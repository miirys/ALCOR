# `@gitlab-org/tui`

React-based terminal UI library built on **Ink** (`vadimdemedes/ink`). Presentation layer - zero domain logic. Used by `packages/cli` for chat interface rendering.

## Build & Test

From inside `packages/tui`:

```bash
mise exec -- bun run test    # Jest unit tests (uses ink-testing-library)
```

No separate build or run step - consumed directly via `packages/cli`.

Formatting and linting can be applied from project root commands.

## Architecture

**Key exports** (`src/index.ts`):

- `App` / `ConfigurationApp` - Main UI components
- `renderTuiApp()` - Bootstraps app with signal handlers, raw TTY mode, Kitty protocol
- `AppState` / `AppCallbacks` - State and event handler interfaces
- `ChatElement` - Union: Message | ToolCall | ErrorMessage
- `useEnrichedInput()` / `useKittyProtocolInput()` - Keyboard handling hooks

**State flows one way**: Caller owns `AppState`, passes it down with `AppCallbacks`. TUI renders and emits events.

**Component hierarchy**:

```text
App → ChatInterface → (AssistantMessage | UserMessage | Tool | ErrorMessage)
    → MessageInput → (TextInput | ChoiceInput)
```

**Key directories**:

- `src/lib/components/` - Shared components (Diff, Markdown, Spinner)
- `src/lib/kitty-protocol/` - Advanced keyboard input for modern terminals
- `src/messages/` - Message rendering components
- `src/configuration/` - Settings UI

## Testing

Uses `ink-testing-library`: `render(<Component />).lastFrame()` to snapshot terminal output.
