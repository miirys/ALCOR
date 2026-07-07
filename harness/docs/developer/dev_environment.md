# Development environment

## Setting up

We use [mise](https://mise.jdx.dev/) to manage our development environment. In order to get started, please [install mise CLI](https://mise.jdx.dev/getting-started.html#installing-mise-cli)

Once `mise` is installed, you can start using it. If you open the project folder in your terminal, you may see a warning message if any tools are missing on your machine:

```shell
mise WARN  missing: node@18.19.0
```

In order to install missing tools run the following command:

```shell
mise install
```

## Environment variables

In order to run some scripts you may need to have specific environment variables set up. Convenient place to manage it is `mise.local.toml` file, as it is not commited to `git`. You can use contents of `example.mise.local.toml` as a reference.
To set up your environment variables add any you need in the `[env]` section.
For example:

```toml
[env]
GITLAB_TEST_TOKEN="<your-test-token"
```

Once you've changed this file, you can apply the changes by running the following command:

```shell
mise set
```

The environment variables will be applied to your shell when you `cd` into a project directory, so typically you don't have to worry about it.

## Local overrides

Tools and env variables defined in `mise.local.toml` will override any defined in `./mise/config.toml`. This may be helpful if you work on something related to upgrading tools versions, or

## Editor extensions

There is a [Mise VSCode](https://marketplace.visualstudio.com/items?itemName=hverlin.mise-vscode) extension available. It does have a lot of downloads, but it allowes your editor to integrate with mise. You can check if all the tools are installed, see the environment variables, etc.
For example:

![Mise VSCode extension](./assets/Screenshot%202025-03-18%20at%2013.39.01.png)

## Scripts and tasks

Right now all development-related scripts are either defined in `package.json` file, or located in `./scripts` folder.
This [will be changed in the future](https://gitlab.com/groups/gitlab-org/-/epics/17149) and will be managed by `mise` as well.
For now, `mise` adds `./node_modules/.bin` folder to `path` so you can access installed tools by simply running the command, for example

```shell
jest --config jest.unit.config.ts
```

## Webview Dev Mode

Webview dev mode lets you develop webviews locally against real backend services. It runs the language server with a fixed HTTP port, env-based auth, and a CSRF token endpoint. Vite proxies `Socket.IO` traffic to the language server.

### Prerequisites

Add your GitLab credentials and project to `mise.local.toml`:

```toml
[env]
# Required scopes: api, read_api, ai_features
GITLAB_TOKEN="glpat-xxxxxxxxxxxxxxxxxxxx"
GITLAB_BASE_URL="https://gitlab.com"
GITLAB_PROJECT_PATH = "gitlab-org/gitlab"
GITLAB_WORKSPACE_FOLDER = "/path/to/local/project"
```

### Running

Start the language server and Vite dev server in separate terminals:

```shell
# Terminal 1 — language server (HTTP on port 3007, env var auth, CSRF endpoint)
mise run start:dev

# Terminal 2 — Vite dev server (proxies `Socket.IO` to the language server)
cd packages/webview && bun run dev
```

The Vite dev server will automatically fetch a CSRF token from the language server and redirect initial page loads to include it.

### How it works

- The `--dev` flag enables env var auth (`GITLAB_TOKEN` / `GITLAB_BASE_URL`), a `GET /api/dev/csrf-token` endpoint, and localhost `Socket.IO` origin.
- `--http-port=3007` binds the HTTP server to a fixed port so the Vite proxy has a known target.
- The `csrfDevTokenPlugin` Vite plugin intercepts document requests under `/webview/root/` and redirects them with a `_csrf` query parameter.
- `VITE_USE_REAL_BACKEND=true` (set in `packages/webview/.env.development`) tells the webview app to use real backend services instead of mocks.

## Development in GDK via VS Code

If you'd like to make changes in the LSP, and have the changes visible in your local VS Code Agentic Chat, connected to your GDK:

1. Clone the [VSCode extension](https://gitlab.com/gitlab-org/gitlab-vscode-extension) repository and the [GitLab Language Server](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp) repository side by side:

   ```plaintext
   parent-directory/
   ├── vscode-gitlab-workflow/    # VSCode extension
   └── gitlab-lsp/               # Language server
   ```

1. In both directories, run `mise install` and `bun install`

1. In the `gitlab-lsp` directory, run `bun run watch`. This will automatically recompile the LSP and make it available to the VS Code extension (via `yalc`), every time you make changes

1. Open VS Code to the `vscode-gitlab-workflow` directory.
   - Click **Run and Debug**, choose **Run Extension** in the dropdown and select **Play**. Note: You may need to select "Debug Anyway" if there's a popup window.
   - This will launch a new VSCode window with the extension running in development mode. Do not close the parent window from above, but you can minimize it.

1. When you make changes in `gitlab-lsp`, the changes should compile automatically. When that is finished, you can go to your VS Code window and use the command "Developer: Reload Window" in the command palette (`Cmd+Shift+P`) to show the changes

1. Output from the LSP can be seen in the VS Code Terminal Output window under `GitLab Language Server`.

### Troubleshooting

#### Hot reloading not working

If your changes are not reflected in the VSCode host window when you are updating the `language-server` codebase,
consider the following.

1. Are your directories siblings? This means they are in the same parent directory. If they aren't, you need to pass the VSCode **relative** path of your machine to the command defined above.

1. When running the `language-server` watch script, are there any errors? Try running `bun run compile` to make sure there are no TypeScript errors.

1. In the `language-server` and `VSCode extension` projects, did you pull the latest `main` branches and run `bun install` in both?

1. Once VSCode host has started, show the `output` window (`CMD + SHIFT + U` on MacOS) and from the dropdown on the right, select `GitLab Language Server`. Are there any errors?

1. Open the Developer tools (`CMD + OPTION + I` on MacOS). Then click on the console tab and check if there are any errors

## Additional Resources

For more information about GitLab Duo Agent Platform, refer to the following documentation:

- [GitLab Duo Agent Platform User Guide](https://docs.gitlab.com/user/duo_agent_platform/)
- [GitLab Duo Agent Platform Development Guide](https://docs.gitlab.com/development/duo_agent_platform/)
