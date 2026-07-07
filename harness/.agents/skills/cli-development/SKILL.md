---
name: cli-development
description: Development workflow for packages/cli (GitLab Duo CLI) and packages/tui. Covers running tests, verification, e2e testing, and compilation for CLI/TUI packages.
---

# CLI & TUI Development

## Verification

After completing CLI or TUI implementation work, run the verify script. It compiles, runs CLI+TUI tests, and lints changed files — stopping on first failure.

```bash
./scripts/dev/verify.sh              # compile + all tests + lint
./scripts/dev/verify.sh --cli-only   # compile + CLI/TUI tests only + lint
./scripts/dev/verify.sh --no-lint    # skip lint
./scripts/dev/verify.sh --no-test    # compile-only
```

Use `--cli-only` when working exclusively on CLI/TUI code to skip LS unit and integration tests.

## Running a Single Test File

Auto-detects workspace from path:

```bash
mise exec -- bun run test:file packages/cli/src/utils/credential_provider.test.ts
mise exec -- bun run test:file packages/tui/src/input.test.ts
```

## E2E Tests

```bash
GITLAB_TEST_TOKEN=$GITLAB_TOKEN bun run --filter @gitlab/duo-cli test:e2e
```

These tests take up to 5 minutes. NEVER EVER pipe them to `tail` to reduce context size. Instead, pipe the result into a temporary file so you can inspect failures if they occur.

Headless CLI in Docker (when headless behavior may be affected):

```bash
GITLAB_AUTH_TOKEN=$GITLAB_TOKEN bun -i ./packages/cli/scripts/test-headless-in-docker/run-in-docker.ts
```

See [references/cli-e2e-environment-constraints.md](references/cli-e2e-environment-constraints.md) for how e2e tests handle env vars and secret isolation in tmux/asciinema.
