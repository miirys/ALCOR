# GitLab Language Server

This repository contains the **GitLab Language Server** and the **GitLab Duo CLI** — two interfaces for [GitLab Duo](https://docs.gitlab.com/user/gitlab_duo/) AI capabilities.

For bugs and feature requests, open a
[new issue](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/-/issues/new).

[[_TOC_]]

## GitLab Duo CLI

An AI-powered command-line tool that brings [GitLab Duo](https://docs.gitlab.com/user/gitlab_duo/) to your terminal. Start an interactive chat, run agentic workflows, and work with your codebase — all without leaving the command line.

📖 **[User documentation](https://docs.gitlab.com/user/gitlab_duo_cli/)** — installation, usage, configuration, and troubleshooting.

For development, see [`packages/cli`](packages/cli/) and [`packages/tui`](packages/tui/).

## GitLab Language Server

The Language Server provides a common backend for IDE extensions to deliver GitLab Duo features:

- GitLab Duo Code Suggestions
- GitLab Duo Chat

### Introduction

LSP (Language Server Protocol) is a technology that provides an abstraction layer
between tools that provide analysis results (language servers) and the "consumer"
IDEs (language clients). It provides a generic interface to provide analysis results
in LSP-enabled IDEs. Implement the analysis one time, and all IDEs then benefit.

This project is an LSP-based language-server that serves
[GitLab AI Code Suggestions](https://docs.gitlab.com/user/project/repository/code_suggestions/)
to LSP-enabled IDEs.

The server primarily supports [LSP protocol version `3.17`](https://microsoft.github.io/language-server-protocol/specifications/lsp/3.17/specification/), with selective support for some [LSP protocol version `3.18`](https://microsoft.github.io/language-server-protocol/specifications/lsp/3.18/specification/) features like inline code completion. See [LSP version](docs/protocol_version.md) for details.

This language server leverages the
[`textDocument/completion`](https://microsoft.github.io/language-server-protocol/specifications/lsp/3.17/specification/#textDocument_completion)
LSP method to serve code suggestions. For most editors, this hooks into the IntelliSense
feature, which you can invoke with the <kbd>Ctrl</kbd> + <kbd>space</kbd> <kbd>Ctrl</kbd> + <kbd>N</kbd> shortcuts.

## Development in the GDK

More information about development of the LSP in the GDK environment can be found in the [Development environment documentation](./docs/developer/dev_environment.md).

## Run the LSP

The LSP client should be responsible for starting the server process and setting up
the connection. The LSP server supports multiple communication methods, and you
must provide one of them at startup:

- **IPC** - Only for communication with the Node process. The server should be a
  Node app. The server is not published as an NPM package, but you can
  use the `out/node/main.js` module if you've compiled the project locally for testing purposes.

  ```shell
  node 'out/node/main.js' --node-ipc
  ```

- **TCP Socket** - Provide a socket port when starting the server process. The client
  should be waiting on that port for the server to connect.

  ```shell
  /opt/gitlab-lsp --socket=6789
  ```

- **STDIO**

  ```shell
  /opt/gitlab-lsp --stdio
  ```

- **Named Pipes** - The Language Server listens as a named pipe server for the client to connect.

  ```shell
  /opt/gitlab-lsp --pipe=pipeName
  ```

You can also run the LSP server by using `npx`, which downloads and runs the npm package for you. For example:

```shell
npx --@gitlab-org:registry=https://gitlab.com/api/v4/packages/npm/ @gitlab-org/gitlab-lsp --stdio
```

[Check `main.ts`](https://github.com/microsoft/vscode-languageserver-node/blob/main/client/src/node/main.ts#L339)
to see how the `vscode-languageclient` Node JS library handles server startup.

## Use open tabs as context

For better results from GitLab Duo Code Suggestions, ensure that Open Tabs Context is enabled in your IDE settings.
This feature uses the contents of the files currently open in your IDE, to get more
accurate and relevant results from Code Suggestions. Like prompt engineering, these files
give GitLab Duo more information about the standards and practices in your code project.

To get the most benefit from using your open tabs as context, open the files relevant to the code
you want to create, including configuration files. When you start work in a new file,
Code Suggestions offers you suggestions in the new file.

Prerequisites:

- Requires GitLab 17.1 or later. Earlier GitLab versions that support Code Suggestions
  cannot weight the content of open tabs more heavily than other files in your project.
- Requires version 4.14.2 or later of the GitLab for VS Code extension.
- GitLab Duo Code Suggestions must be enabled for your project, and
  [configured in the GitLab for VS Code extension](https://docs.gitlab.com/user/project/repository/code_suggestions/set_up/#vs-code).
- Requires a [supported code language](#advanced-context-supported-languages).

1. Download and install a supported version of the GitLab extension from the
   [Visual Studio Marketplace](https://marketplace.visualstudio.com/items?itemName=GitLab.gitlab-workflow).
   For more about configuring the extension, see
   [its setup instructions](https://gitlab.com/gitlab-org/gitlab-vscode-extension#setup).
1. Open the files you want to provide for context. Advanced Context uses the most recently
   opened or changed files for context. If you don't want a file sent as additional context, close it.
1. To fine-tune your Code Generation results, add code comments to your file that explain
   what you want to build. Code Generation treats your code comments like chat. Your code comments
   update the `user_instruction`, and then improve the next results you receive.

As you work, GitLab Duo provides code suggestions that use your other open files
(within [truncation limits](https://docs.gitlab.com/user/project/repository/code_suggestions/#truncation-of-file-content))
as extra context.

To learn about the code that builds the prompt, see these files:

- **Code Generation**:
  [`ee/lib/api/code_suggestions.rb`](https://gitlab.com/gitlab-org/gitlab/-/blob/master/ee/lib/api/code_suggestions.rb#L76)
  in the `gitlab` repository
- **Code Completion**:
  [`ai_gateway/code_suggestions/processing/completions.py`](https://gitlab.com/gitlab-org/modelops/applied-ml/code-suggestions/ai-assist/-/blob/fcb3f485a8f047a86a8166aad81f93b6d82106a7/ai_gateway/code_suggestions/processing/completions.py#L273)
  in the `modelops` repository

We'd love your feedback about the Advanced Context feature in
[issue 258](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/-/issues/258).

### Advanced Context supported languages

The Advanced Context feature supports these languages:

- Code Completion: all configured languages.
- Code Generation: Go, Java, JavaScript, Kotlin, Python, Ruby, Rust, TypeScript (`.ts` and `.tsx` files), Vue, and YAML.

To add additional code completion languages, set them in the `codeCompletion.additionalLanguages` client setting. For
example:

```json
"codeCompletion": {
  "additionalLanguages": ["markdown"]
}
```

## Install the language server client

To install the language server binary locally:

1. Download the language server binary from the
   [Package Registry page](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/-/packages).
   For every release you can download the binary that matches your OS and architecture.
   In the list of assets linked in the release, binaries end with the string `<os>-<arch>`.
1. Place the binary anywhere on your file system. The configuration in this documentation
   assumes you've placed the binary under `/opt/gitlab-lsp`.
1. The language server requires an access token to authenticate with the GitLab API.
   Create a personal access token (PAT) with the `api` scope, or
   OAuth token with the same scope. Provide this token to the server sending the
   [`didChangeConfiguration` notification](https://microsoft.github.io/language-server-protocol/specifications/lsp/3.17/specification/#workspace_didChangeConfigurationworkspace/didChangeConfiguration)
   from the client to the server after the server is started.
   [See the details here](docs/supported_messages.md#didchangeconfiguration).
1. In your terminal, make the binary executable with this command:

   ```shell
   chmod +x opt/gitlab-lsp
   ```

1. The client implementation depends on your text-editor or IDE. See the next section.

### Allow the binary to run on macOS

MacOS users might encounter a message in the terminal, saying the binary was killed
as soon as you started it. This happens because of a security feature called Gatekeeper.
To allow the binary to run, clear its extended attributes and ad-hoc sign it,
which establishes trust with Gatekeeper.

Run these commands in your terminal, and enter your password if prompted:

```shell
sudo xattr -c opt/gitlab-lsp
codesign --force -s - opt/gitlab-lsp
```

## Node version

The NodeJS version may differ between the output desktop bundle and output binaries, due to compatibility needs.

The overall node version is defined in the `[tools]` section of `./mise/config.toml`. See [dev_environment docs](./docs/developer/dev_environment.md) for more details.

To upgrade the version of Node in use:

1. Update the following files with the new version number:
   1. `./mise/config.toml` - Update the Node.js version in the `[tools]` section.
   1. `.gitlab-ci.yml` - Update any references to the Node.js version.
1. Update the files listed in the Desktop section below, if necessary.
1. Update the files listed in the Binary section below, if necessary.
1. Update the files listed in the Browser section below, if necessary.

### Desktop main-bundle-node.js NodeJS version

We aim to target the Node version VS Code uses as defined in the
[`Microsoft/vscode` project](https://github.com/microsoft/vscode/blob/main/.nvmrc).

The specific language features in use are defined by the `@types/node` dependency in [`./package.json`](./package.json).

The output is transformed according to esbuild's `targets` config, found in [`./scripts/esbuild/desktop.ts`](./scripts/esbuild/desktop.ts).

### Binary output NodeJS version

We build Language Server binaries for a number of platforms.

The version of NodeJS that is packaged into the binaries is defined by the `NODE_VERSION` variable in [`./scripts/package.sh`](./scripts/package.sh).

### Browser browser/main-bundle.js target

The browser bundle is used in the Web IDE. This does not target NodeJS, it targets a browser environment.

The output is transformed according to `targets` in [`./scripts/esbuild/browser_common.ts`](./scripts/esbuild/browser_common.ts).

### Other

- Jest tests use Babel's [targets configuration](./babel.config.js).

## Development setup

Check [development environment docs](./docs/developer/dev_environment.md) for detailed information about setting up the developer environment.

To debug or add new features to the language server:

1. Clone this repository.
1. Run `bun install`.
1. Compile the server code with `bun run compile` or `bun run watch` to
   compile when the changes are made.

### Watch mode

Watch mode rebuilds the project automatically with every file change.
It also uses `yalc` to copy build artifacts to an editor project for local debugging (including
updating the local `@gitlab-org/gitlab-lsp` package used by the VS Code extension).
For details, see the [watch mode script](scripts/turbo/turbo_watch.ts).

For example, to automatically copy files to the VS Code extension, run this command:

```shell
bun run watch -- --editor=vscode
```

Then, in VS Code, you can restart your extension development host, and it
receives the latest server changes.

Run `bun run watch -- --help` to see other options.

#### Script parameters

These parameters are optional:

- `-e, --editor <type>` - Specify editor type (vscode, jetbrains). If set, the script will copy build artifacts to your editor project directory.
- `--editor-path <path>` - Path to editor plugin/extension project directory. Defaults to `../gitlab-vscode-extension` for vscode and `../gitlab-jetbrains-plugin` for jetbrains.

Environment variables `LS_EDITOR` and `LS_EDITOR_PATH` can also be used and are
overridden by the corresponding flags.

Example usage:

```shell
bun run watch -- --editor vscode --editor-path ../my-vscode-extension
bun run watch -- --editor jetbrains --editor-path ../my-jetbrains-plugin
```

### Start with another client, or without the client

To start the server separately, either:

- Run `bun run debug`.
- Run this command:

  ```shell
  node --inspect=6010 ./out/node/main.js --socket=6789
  ```

Your client should establish the socket connection, and wait on port `6789` for the server to connect.

### Debug the server

To debug the Language Server, you can:

- [Start the Language Server](#start-the-language-server).
- [Connect to the Language Server in the VS Code extension](#connect-to-ls-in-the-vs-code-extension).
- [Connect to the Language Server using Chrome Developer Tools](#connect-to-ls-with-chrome-developer-tools).

#### Start the Language Server

1. Open the project in VS Code.
1. Run the **Start server** launch task.

The launch task starts a Language Server that listens on port `6789` for a client connection,
and connects VS Code debugger to it.

#### Connect to LS in the VS Code extension

Prerequisites:

1. If you don't have `code` command available in your shell, add it: [Launching VS Code from the command line](https://code.visualstudio.com/docs/setup/mac#_launching-from-the-command-line).
1. [Set up the extension project](https://gitlab.com/gitlab-org/gitlab-vscode-extension/blob/main/docs/developer/language-server.md)
   for LS development.
1. [Start the VS Code extension](https://gitlab.com/gitlab-org/gitlab-vscode-extension/-/blob/main/CONTRIBUTING.md?ref_type=heads#step---4--running-the-extension-in-desktop-vs-code) in development mode.
1. Use the command line to open this project in VS Code, replacing the path with
   the path of your VS Code Extension project:

   ```shell
   GITLAB_WORKFLOW_PATH=/Users/tomas/workspace/gitlab-vscode-extension code .
   ```

   This command is important. It maps the bundled sources in the extension with the source code in this project.

1. Run the **Attach to VS Code Extension** launch task.

#### Connect to LS with Chrome Developer Tools

Prerequisites:

- Your server must be a Node module, not an executable.

1. Either:
   - [Start the VS Code extension](https://gitlab.com/gitlab-org/gitlab-vscode-extension/-/blob/main/CONTRIBUTING.md?ref_type=heads#step-4-running-the-extension-in-desktop-vs-code) in development mode, or
   - [Start the server](#start-with-another-client-or-without-the-client).
1. Open [`chrome://inspect`](chrome://inspect) in a Chrome browser. For more information and
   debugging tools, see [Inspector Clients](https://nodejs.org/en/docs/guides/debugging-getting-started#inspector-clients)
   in the Node.js documentation.
1. Select **Configure**, and ensure your target host and port are listed. Use `localhost:6010`.
1. Select **Open dedicated DevTools for Node**.
1. Either add the `debugger` statement, or add `console.log` in your server code.
1. Recompile after you change the code.

When you start the Language Server, the inspector pauses on the breakpoints.

### Connect LS with Local GDK Changes for Duo Development

Prerequisites:

- Your `gdk` must have Duo configured.

1. **Authenticate with GitLab:** Connect to your local GDK URL (e.g., `https://gdk.test:3443/`) using a personal access token with `ai_features` permission.
1. **Switch accounts:** In VS Code, open the Command Palette (`Command + Shift + P`) and select "GitLab Select Account for this Workspace" to switch to your GDK account.

### Integration Testing

The project uses integration tests to verify language server features end-to-end, by starting the actual language server process and testing through the LSP protocol interface.

For details on running and contributing integration tests, see the [integration testing documentation](src/tests/int/README.md).

### Test changes in downstream project pipelines

You can install the artifact created by the `build_package_for_integration` job
in merge request pipelines in downstream projects. This allows you to run CI/CD
for the downstream project without waiting for a new Language Server version to
be published.

For instance, in the VS Code extension, you can run:

```shell
npm install <URL>
```

where `URL` is the URL reported in the job log. Then, you can commit the
`package*.json` changes and push them to a merge request.

### Lint documentation

This project follows the documentation guidelines of GitLab and uses `markdownlint`
and `vale` to improve the content added and make sure it adheres to our guidelines.
You can find information on
[installing the linters](https://docs.gitlab.com/development/documentation/testing/#install-documentation-linters),
[integrating Vale](https://docs.gitlab.com/development/documentation/testing/vale/#configure-vale-in-your-editor), and
[integrating markdownlint](https://docs.gitlab.com/development/documentation/testing/markdownlint/#configure-markdownlint-in-your-editor)
in the GitLab documentation.

## Bundling

We need to create a self-contained bundled JavaScript file that is started by
VS Code. We use `esbuild` to bundle all the dependencies into one file located in
`out/main-bundle-node.js`.

## Packaging

Run:

```shell
mise run package-binaries
```

Your binary is available in the `bin` folder of the project.

## Releases

See [Release Process](./docs/developer/release-process.md).

## MCP Integration

The GitLab Language Server supports [Model Context Protocol (MCP)](https://modelcontextprotocol.io/)
integration for extending GitLab Duo Chat with custom tools and data sources. MCP servers can be
configured in two locations. The Language Server merges configurations from both locations, with
workspace settings taking priority.

### Configuration locations

1. **User configuration**: `~/.gitlab/duo/mcp.json`
   - Can be accessed from the Command Palette with the command: `GitLab MCP: Open User Settings (JSON)`
   - Global configuration that applies to all workspaces.
   - Useful for personal tools and commonly used servers.

1. **Workspace configuration**: `<workspace>/.gitlab/duo/mcp.json`
   - Project-specific configuration.
   - Takes precedence over user-level configuration for duplicate server names.

### Configuration format

```json
{
  "mcpServers": {
    "server-name": {
      "command": "path/to/server",
      "args": ["--arg1", "value1"],
      "env": {
        "ENV_VAR": "value"
      }
    },
    "http-server": {
      "url": "http://localhost:3000/mcp"
    }
  }
}
```

## Troubleshooting

## Advanced Context feature and memory

The Advanced Context feature stores file information in memory. If you
encounter memory errors, use fewer files to generate context, and close
any you don't need.
