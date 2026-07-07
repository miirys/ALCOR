# GitLab Duo CLI (Beta)

> [!note]
> Duo CLI npm package (`@gitlab/duo-cli`) is not under active development.
> Install the GitLab Duo CLI with [`glab duo cli`](https://docs.gitlab.com/cli/) or as a [standalone binary](https://docs.gitlab.com/user/gitlab_duo_cli/?tab=Compiled+binary#set-up-the-gitlab-duo-cli) instead.

GitLab Duo for your command line. An AI-powered CLI tool that brings
[GitLab Duo Agentic Chat](https://docs.gitlab.com/user/gitlab_duo_chat/agentic_chat/) to your
terminal.

📖 **For installation, usage, and configuration see the [GitLab Duo CLI documentation](https://docs.gitlab.com/user/gitlab_duo_cli/).**

## Development

To run the CLI from a local checkout, from inside `packages/cli`:

```shell
bun run start
```

This builds and launches the app. Pass CLI flags after `--`:

```shell
bun run start -- run --goal "example"
```

For hot-reload development, use `bun run dev:watch` instead.

> [!note]
> The `bun run start` and `bun run dev:watch` scripts are package-local and must be
> run from inside `packages/cli`. The repository root exposes equivalent scripts
> (`bun run cli`, `bun run cli:watch`) that can be run from the checkout root.

See the [Development Guide](./docs/development.md) for prerequisites, building, debugging,
testing, architecture details, and how the CLI resolves credentials during development
(standalone vs. `glab` authentication paths).

### Packages

The GitLab Duo CLI is split across two packages:

- **`packages/cli`** — CLI entry point, command routing, backend abstraction, and controllers for interactive and headless modes.
- **[`packages/tui`](../tui/)** — React-based terminal UI built on [Ink](https://github.com/vadimdemedes/ink). Pure presentation layer with zero domain logic. Renders the chat interface, messages, tool calls, diffs, and Markdown.

## License

See the [License](../../LICENSE) for details.
