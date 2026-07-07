# E2E Tests for GitLab Duo CLI

End-to-end tests for the interactive GitLab Duo CLI interface, running the actual built binary in a real terminal environment using tmux.

## Setup

### 1. Install Dependencies

```shell
bun install
```

### 2. Install tmux

The tests require tmux to be installed:

```shell
# macOS
brew install tmux

# Ubuntu/Debian
apt-get install tmux

# Fedora/RHEL
dnf install tmux
```

### 3. Set Test Token

The tests require a valid GitLab token to authenticate:

```shell
export GITLAB_TEST_TOKEN=your-gitlab-token-here
```

## Running Tests

```shell
# From workspace root
GITLAB_TEST_TOKEN=xyz bun run --filter @gitlab/duo-cli test:e2e

# From packages/cli directory
GITLAB_TEST_TOKEN=xyz bun run test:e2e
```

## How It Works

The e2e tests use tmux to spawn the CLI in a real terminal session. This approach provides:

- **Fixed terminal dimensions** - Consistent viewport size across test runs
- **Headless operation** - Tests run in detached tmux sessions
- **Output inspection** - Terminal content captured via `tmux capture-pane`
- **Special key injection** - Send escape sequences, ctrl combinations
- **Isolation** - Each test gets its own terminal session
- **Debugging** - Attach to sessions interactively during development

### tmux Commands Used

| Command                                           | Description                                        |
| ------------------------------------------------- | -------------------------------------------------- |
| `new-session -d -s <name> -x <width> -y <height>` | Create detached session with controlled dimensions |
| `send-keys -t <session> "text" Enter`             | Send text input                                    |
| `send-keys -t <session> -l "text"`                | Send literal text (no interpretation)              |
| `capture-pane -t <session> -p`                    | Capture and print terminal output                  |
| `kill-session -t <session>`                       | Clean up session                                   |

## Test Structure

- **`terminal_test_helper.ts`** - Playwright-like API for tmux terminal interactions
- **`test_utils.ts`** - Utility functions for paths and environment
- **`basic.e2e.test.ts`** - Basic interaction test

## Troubleshooting

### `GITLAB_TEST_TOKEN not set`

Set the `GITLAB_TEST_TOKEN` environment variable with a valid GitLab PAT.

### Test timeout

Increase the timeout in the test or check if the CLI is hanging. The default timeout is 30 seconds.

### Authentication errors

Make sure your token is valid and has the necessary scopes for GitLab Duo features.

### Debugging a test

You can use the `attach()` method on the terminal helper to interactively debug:

```typescript
const terminal = new TmuxTerminalTest('node', [cliBinaryPath]);
terminal.attach(); // Opens tmux session for interactive inspection
```

Or manually attach to a running test session:

```shell
tmux list-sessions  # Find the session name
tmux attach -t <session-name>  # Ctrl+B then D to detach
```
