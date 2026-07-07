# E2E Environment Constraints

## How env overrides work

E2e tests don't replace the full environment — they **override** specific keys. The tmux session inherits everything from the tmux server; only explicitly listed keys change.

Two helpers in `test_utils.ts`:

- **`createTestEnv(overrides)`** — returns overrides map with defaults: `CI='false'` (keeps Ink interactive by bypassing `ci-info` detection) and `DUO_WORKFLOW_TELEMETRY_ENABLED='0'`.
- **`buildEnvCommand(env)`** — converts the map to `['env', '-u', 'KEY1', 'KEY2=val', ..., 'bash']`, passed as tmux's initial command (positional args, no shell involved).

## Unsetting vs empty strings

Set a key to `''` to **truly unset** it via `env -u KEY`. This matters because Commander binds env vars to options — `GITLAB_TOKEN=''` still triggers the binding, while unsetting it doesn't.

The `-u` flags must come before `K=V` assignments (`env` stops parsing options at the first `NAME=VALUE`).

## Secret leaking

Env vars injected via the tmux initial command never appear in scrollback or `.cast` recordings. Two rules:

- **Never** `tmux send-keys` with `export SECRET=...` — it appears in scrollback.
- **Never** pass secrets as CLI flags (`--gitlab-auth-token`) — they appear in scrollback. Use `GITLAB_TOKEN` env var instead. Set `tokenViaFlag: true` only in tests that verify flag-based auth.

## Where env is handled

Only `ChatPage.launch()` and network test helpers call `buildEnvCommand()`. The tmux and asciinema layers have **no env awareness** — they just run commands.

`tui_ctrl.ts` (agent CLI tool) also has no env handling — it inherits the caller's environment.

## CI notes

- **`retry: 2`** on `cli-e2e-test` — runner performance flakiness.
- **Auth wait timeout** — 30s in CI, 15s locally (`process.env.CI` check in `auth.e2e.test.ts`).
