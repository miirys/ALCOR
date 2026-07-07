---
name: tui-testing
description: Test interactive TUI features and record walkthrough demos with asciinema. Use when implementing, verifying, or demonstrating Duo CLI terminal UI features.
---

# TUI Testing & Recording

Test Duo CLI interactive features and record asciinema walkthroughs.

## CLI Tool

All interactions go through `tui_ctrl.ts`:

```bash
CTRL="<SKILL_DIR>/../../../packages/cli/test/e2e/tui_ctrl.ts"
```

Every command takes `-s SESSION_NAME` to identify the tmux session. The agent picks a simple name (e.g. `chat-test`).

## Global vs Local `duo`

**The `duo` command runs the globally installed version, NOT the local build.** When testing changes from the current branch, use `bun run cli` from the project root:

```bash
PROJECT_ROOT="/path/to/gitlab-lsp"
# PROJECT_ROOT="/path/to/gitlab-lsp/branch-name" if the user uses worktrees
$CTRL launch -s test --cwd "$PROJECT_ROOT" -- bun run cli
```

`bun run cli` builds the bundle and runs it with `--use-system-ca`. Use bare `duo` only when testing the globally installed version.

## Testing a Feature

```bash
#!/usr/bin/env bash
CTRL="<SKILL_DIR>/../../../packages/cli/test/e2e/tui_ctrl.ts"
SESSION="feat-test"
trap '$CTRL kill -s $SESSION' EXIT

$CTRL launch -s $SESSION duo
$CTRL wait -s $SESSION "Get help with code" --timeout 40
sleep 1

$CTRL writeln -s $SESSION "hello"
$CTRL wait-duo -s $SESSION --timeout 60

$CTRL writeln -s $SESSION "/help"
$CTRL wait -s $SESSION "Shortcuts" --timeout 10

if $CTRL screen -s $SESSION | grep -q "Slash Commands"; then
    echo "✓ /help shows slash commands"
else
    echo "✗ /help missing slash commands" >&2
    exit 1
fi
```

## Recording a Walkthrough

Recording is always on. Every `launch` produces a `.cast` file at `/tmp/tui-ctrl-recordings/<session>/recording.cast`. Use `--record PATH` to override.

```bash
#!/usr/bin/env bash
CTRL="<SKILL_DIR>/../../../packages/cli/test/e2e/tui_ctrl.ts"
SESSION="demo"
CAST="/tmp/demo.cast"
trap '$CTRL kill -s $SESSION' EXIT

$CTRL launch -s $SESSION --record $CAST --title "Chat demo" duo
$CTRL wait -s $SESSION "Get help with code" --timeout 40
sleep 1

# First message — wait-duo works here
$CTRL writeln -s $SESSION "What is 2+2?"
$CTRL wait-duo -s $SESSION --timeout 60
sleep 2

# Follow-up — use streaming indicator (wait-duo would return immediately)
$CTRL writeln -s $SESSION "And what is 3+3?"
$CTRL wait -s $SESSION "Duo is thinking" --timeout 15
$CTRL wait-absent -s $SESSION "Duo is thinking" --timeout 120
sleep 3  # pause so viewer can read

$CTRL key -s $SESSION ctrl-c
sleep 1
$CTRL stop-recording -s $SESSION $CAST
```

### Recording pacing tips

- **Typing speed**: Use `--delay 40` on `write`/`writeln` for human-like typing (40ms per char). Without `--delay`, text appears instantly.
- **Between actions**: Add `sleep 2-4` so viewers can read the screen before the next action.
- **After navigation** (↑/↓/Enter/Esc): Add `sleep 1-2` so the UI change is visible.
- **After typing**: Add `sleep 1` before pressing Enter so the viewer sees the full text.

```bash
# Good recording pacing
$CTRL write -s $SESSION --delay 40 "describe the bug here"
sleep 1
$CTRL key -s $SESSION enter
sleep 2
```

### Uploading recordings

**IMPORTANT**: Never use `asciinema.org`. We use a self-hosted server at `https://asciinema.duo-cli-testing.com/`. See `docs/developer/asciinema.md` for setup.

**Prefer uploading the `.cast` file** over converting to GIF — it gives an interactive player and is easier to share.

```bash
asciinema upload --title "My demo title" --visibility unlisted /tmp/demo.cast
```

Share the printed URL in MR comments.

Convert to GIF as a fallback only when the server is unavailable: `agg --theme monokai /tmp/demo.cast /tmp/demo.gif`

## Waiting for Duo Responses

The e2e test suite (`packages/cli/test/e2e/pages/chat_page.ts`) uses these patterns:

| Pattern             | Meaning                                 |
| ------------------- | --------------------------------------- |
| `●`                 | Duo's response block is rendered        |
| `Duo is thinking`   | Duo is streaming (disappears when done) |
| `Type your message` | Input is ready for the next message     |

Use `wait-duo` for the **first** message only (it checks `●` + input ready, which are already on-screen after the first response):

```bash
$CTRL writeln -s $SESSION "hello"
$CTRL wait-duo -s $SESSION --timeout 60
```

For **follow-up messages**, use the streaming indicator instead:

```bash
$CTRL writeln -s $SESSION "next question"
$CTRL wait -s $SESSION "Duo is thinking" --timeout 15       # confirms message was sent
$CTRL wait-absent -s $SESSION "Duo is thinking" --timeout 60  # response complete
```

`wait-duo` returns immediately on follow-ups because `●` and `Type your message` are already visible from the previous response.

## Visible Output vs Full Scrollback

Duo uses Ink's `<Static>` component for rendered messages. As new messages appear, older ones scroll out of the visible terminal viewport.

- **`screen`** — visible screen only. Use for current UI state: input prompt, loading indicator, last response.
- **`scrollback`** — includes scrollback. Use for conversation history or any content that may have scrolled off.

`wait` and `wait-absent` check **visible output only**. If you need to assert on earlier messages, use `$CTRL scrollback -s $SESSION | grep PATTERN`.

## Command Reference

### Session Management

| Command                                                                                           | Description                        |
| ------------------------------------------------------------------------------------------------- | ---------------------------------- |
| `launch -s NAME [--cwd DIR] [--cols N] [--rows N] [--record FILE [--title T]] [--] CMD [ARGS...]` | Start TUI in tmux (always records) |
| `stop-recording -s NAME [CAST_FILE]`                                                              | Finalize the .cast file            |
| `kill -s NAME`                                                                                    | Kill session                       |

Default terminal size is 120×50. Override with `--cols`/`--rows`.

### Input

| Command                             | Description                                                               |
| ----------------------------------- | ------------------------------------------------------------------------- |
| `writeln -s NAME [--delay MS] TEXT` | Type text + Enter. `--delay` adds per-char pause (ms) for recordings      |
| `write -s NAME [--delay MS] TEXT`   | Type text (no Enter). `--delay` adds per-char pause (ms)                  |
| `key -s NAME KEY`                   | Special key: enter, escape, tab, up, down, ctrl-c, ctrl-r, or single char |

### Output & Waiting

| Command                                     | Description                                     |
| ------------------------------------------- | ----------------------------------------------- |
| `screen -s NAME`                            | Visible terminal text (ANSI stripped) to stdout |
| `scrollback -s NAME`                        | Full scrollback (ANSI stripped) to stdout       |
| `wait -s NAME PATTERN [--timeout N]`        | Block until pattern appears (default 30s)       |
| `wait-absent -s NAME PATTERN [--timeout N]` | Block until pattern disappears                  |
| `wait-duo -s NAME [--timeout N]`            | Wait for `●` + input ready (default 60s)        |

## CI: Skip Token Check

In CI environments, the token check may fail (e.g. when using project/group tokens with limited scopes). Pass `--skip-token-check` to bypass it:

```bash
$CTRL launch -s $SESSION --cwd "$PROJECT_ROOT" -- bun run cli --skip-token-check
```

Or set the environment variable before launching:

```bash
export GITLAB_SKIP_TOKEN_CHECK=true
$CTRL launch -s $SESSION --cwd "$PROJECT_ROOT" -- bun run cli
```

This flag is hidden from user-facing help. It skips the `/personal_access_tokens/self` validation call and assumes the token is valid.

## Gotchas

**Don't use `set -e` in test scripts.** `$CTRL screen | grep "pattern"` returns exit 1 when not found, killing the script.

**Commands with `--` flags need separator.** Use `--` before the command if it has `--` flags: `$CTRL launch -s test -- bun run cli`. Without `--`, flags starting with `-` are consumed by `launch`.

**Duo startup takes time.** Wait for the welcome box before typing: `$CTRL wait -s NAME "Get help with code" --timeout 40` then `sleep 1`. Earlier patterns like `"Type your message"` or `"Ctrl+C to exit"` appear before Duo's input is wired up, causing lost keystrokes.

**Stopping duo in recordings.** Use `$CTRL key -s NAME ctrl-c` before `stop-recording` — duo doesn't respond to `exit`. Pass the cast file path to `stop-recording` so it waits for the file to be written.

**Log file paths are unpredictable.** They live under `/var/folders/<hash>/<hash>/T/gitlab-duo-cli/`. Use `fd duo-cli-log /var/folders/ --no-ignore --type f --changed-within 2min | sort | tail -1` to find recent logs.

**Cleanup on exit.** Always use `trap '$CTRL kill -s $SESSION' EXIT` to avoid orphaned tmux sessions.
