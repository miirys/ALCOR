# GitLab Duo CLI — Development Guide

Development guide for `@gitlab/duo-cli`. For end-user documentation (installation, usage, configuration), see the
[GitLab Duo CLI documentation](https://docs.gitlab.com/user/gitlab_duo_cli/).

## Prerequisites

The CLI builds and runs with [bun](https://bun.sh/). From the repository root:

```shell
mise install              # install mise-managed tools including bun
bun install               # install dependencies
```

## Authentication

For development, the easiest way to authenticate is via the `GITLAB_TOKEN` environment variable:

```shell
export GITLAB_TOKEN="<your-personal-access-token>"
```

The token must be a [personal access token](https://docs.gitlab.com/user/profile/personal_access_tokens/) with `api` scope.

Alternatively, you can authenticate through the CLI configuration screen on first run, or use the `glab` CLI as a credential helper. See the [user documentation](https://docs.gitlab.com/user/gitlab_duo_cli/#authenticate-with-gitlab) for all authentication methods.

### Credential resolution

How the CLI obtains credentials does not depend on which directory you run it from. `bun run start`
(in `packages/cli`) and `bun run cli` (at the repository root) are equivalent: both launch the
**standalone** distribution. What changes the credential source is the distribution, which is set
by how the CLI is launched, not by the working directory.

There is a single credential resolution chain. The distribution only changes one step in it:

- Standalone (`bun run start` / `bun run cli`):
  - `GITLAB_TOKEN` environment variable or `--gitlab-auth-token` flag
  - the config file at `~/.gitlab/storage.json`
  - the `glab auth credential-helper` fallback
  - no credentials
- glab (`bun run cli:glab`, which mirrors the production `glab duo cli` integration):
  - `GITLAB_TOKEN` environment variable or `--gitlab-auth-token` flag
  - the `glab auth credential-helper`
  - no credentials

  Under the glab distribution the config file step is skipped, because glab owns the credentials
  and base URL.

For local development we recommend the `glab` distribution via `bun run cli:glab`: it exercises the
same authentication path that users get in production, so if you are already signed in with
`glab auth login` no extra token setup is needed. See [Running via glab (local binary)](#running-via-glab-local-binary)
for details.

To run standalone against a specific token, set `GITLAB_TOKEN` (and `GITLAB_URL` for a non-default
instance) or pass `--gitlab-auth-token`.

## Running during development

**Run the CLI from a local checkout** (builds and launches):

```shell
bun run cli
bun run cli -- run --goal "example"   # pass CLI flags after --
```

Other development commands:

- `bun run dev:watch` - starts the application with bun in watch mode. The application will be automatically restarted if code changes are made
- `bun run dev:watch-tools` - as above, but react devtools will be started alongside connected to the application
- `bun run start` - compiles the application to js and starts it. This is exactly the version of the app that will be packaged to the npm package. It is recommended to test your changes with it before creating an MR

When using the `package.json` scripts, use `--` to separate flags between bun/CLI. For example:

```shell
cd packages/cli
bun run dev:watch -- --cwd /foo/bar # this passes through --cwd to the CLI, rather than bun itself getting the flag
```

## Running via glab (local binary)

`glab duo cli` is the production entry point for duo-cli. You can point it at a locally built binary
to test your changes in the same execution environment used by end users — compiled native binary,
glab-managed authentication, and the full `glab duo cli` argument flow.

### Prerequisites

`glab` must be installed with support for the `GLAB_DUO_CLI_BINARY_PATH` environment variable.
Use `mise install` to get the version pinned in this repo.

`glab auth status` command should indicate you have valid GitLab credentials.

### Usage

From the repo root, build a native binary for your current platform and launch it via glab:

```shell
bun run cli:glab
```

To pass arguments to duo-cli, append them after `--`:

```shell
bun run cli:glab -- run --goal "explain this code"
```

Under the hood this script:

1. Builds `packages/cli/bin/duo-native` for your current OS/arch via `compile_executables.ts local-dev`
1. Runs `GLAB_DUO_CLI_BINARY_PATH=packages/cli/bin/duo-native glab duo cli`

You can also run the two steps separately:

```shell
# Build only
bun run turbo -- run build:dev-binary --filter=@gitlab/duo-cli

# Run without rebuilding
GLAB_DUO_CLI_BINARY_PATH=packages/cli/bin/duo-native glab duo cli
```

## Build and test

```shell
bun run build:bundle                  # Production build → dist/index.js
bun run compile                       # TypeScript type check
bun run test                          # Jest unit tests
```

### E2E tests

End-to-end tests run the built binary in a real terminal via tmux. See [`test/e2e/README.md`](../test/e2e/README.md) for setup and details.

```shell
GITLAB_TEST_TOKEN=xyz bun run test:e2e
```

## Verifying changes in a terminal

When verifying UI or interaction changes in Duo CLI, test against the terminals that represent actual user traffic. Based on
[terminal usage data](https://app.snowflake.com/ys68254/gitlab/#/editor-extensions-dau-dX7ESeVwy) (GitLab-internal), the most commonly used
terminals are:

- Apple Terminal
- iTerm
- VS Code integrated terminal

This list is subject to change as adoption of Duo CLI grows.

## Compilation

To create standalone executables for distribution, use the compilation script:

```shell
bun run build:binary
```

This will create cross-platform executables in the `./bin` directory:

- `duo-linux-x64` - Linux 64-bit
- `duo-linux-arm64` - Linux ARM64
- `duo-darwin-x64` - macOS Intel
- `duo-darwin-arm64` - macOS Apple Silicon
- `duo-windows-x64.exe` - Windows 64-bit

## Debugging

The CLI supports several debugging options for development:

### VS Code Debug Configurations

If you're using VS Code, there are pre-configured launch configurations available:

1. **Debug CLI (Compiled)** - Launches the compiled CLI in the integrated VS Code terminal with source maps and debug logging enabled. This automatically builds the CLI first using the `build:debug` task.

1. **Attach to CLI** - Attaches the debugger to a running CLI process on port 9229. Use this with the `debug:built` script.

1. **Debug CLI (External Terminal)** - Launches the CLI in an external terminal and automatically attaches the debugger. This is useful when you need to interact with the CLI's terminal UI while debugging.

### Debugging Outside of VS Code

The following scripts are available for debugging:

- `debug:built` - Builds the CLI in debug mode and starts it with the Node.js inspector attached, pausing at the first line of code:
  After running this, use the "Attach to CLI" VS Code configuration or connect any Node.js debugger to `localhost:9229`.

All debug builds include source maps, allowing you to set breakpoints in the original TypeScript source files.

## Troubleshooting

If you have issues with Bun not resolving installed node_modules in the packages, you may need to clear node_modules folders and reinstall:

```shell
bun install
```
