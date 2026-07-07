# GitLab Duo Agent Platform Webview

## Summary

The GitLab Duo Agent Platform Webview package is a crucial component of the GitLab for VS Code extension that implements the GitLab Duo Agent Platform interface. This package provides a Vue.js-based web application that renders the interactive GitLab Duo Agent Platform interface within VS Code. It enables developers to review, manage, and interact with GitLab Duo Agent Platform features directly from their development environment.

The package is built using Vue 2, integrates with the GitLab UI component library, and provides a seamless bridge between the VS Code extension system and the functionality of the GitLab Duo Agent Platform.

## Getting Started

First, start by reading through the [prerequisites of the GitLab Duo Agent Platform](https://docs.gitlab.com/user/duo_workflow/set_up/#prerequisites) to make sure you have correct setup and permissions.

Then to start developing locally with GitLab Duo Agent Platform webview, you'll need to:

1. Clone the [GitLab for VS Code extension](https://gitlab.com/gitlab-org/gitlab-vscode-extension) repository and the [GitLab Language Server](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp) repository side by side:

   ```bash
   parent-directory/
   ├── vscode-gitlab-workflow/    # VS Code extension
   └── gitlab-lsp/               # Language server
   ```

1. Ensure you have [bun](https://bun.sh/) installed on your system (or use `mise install`).

1. Install dependencies in both repositories by running `bun install` in their respective root directories.

### Development Setup

1. In the Language Server directory (`gitlab-lsp`), start the GitLab Duo Agent Platform development server:

   ```bash
   bun run duo:workflow
   ```

   This command will build and watch for changes in the `webview-duo-workflow-panel` and the `workflow-api` packages.

1. In VS Code:
   - Open the VS Code extension project
   - Click **Run and Debug**, choose **Run Extension** in the dropdown and select **Play**.
   - This will launch a new VS Code instance with the extension running in development mode.
   - A new host window will appear if the script copmpiles successfully.

The development setup enables hot-reloading of the webview components. To view your changes, simply run the VS Code command (CMD + SHIFT + P) `Developer: Reload Webviews`.

## Code Structure

The codebase is organized into two main directories under `src/`:

### Plugin Directory (`src/plugin/`)

The plugin directory contains code that interfaces with the VS Code extension system:

- `controllers/`: Handles communication between the webview and VS Code extension
- `utils/`: Helper functions for the plugin layer
- `index.ts`: Main entry point for the plugin integration

This layer acts as a bridge between the VS Code extension and the web application, handling message passing and state management.

### App Directory (`src/app/`)

The app directory contains the Vue.js application that renders the GitLab Duo Agent Platform interface:

- `duo_chat/`: Components and logic for the chat interface. This is a vendored version of GitLab Duo Chat so that it can be modified inside the LSP project for GitLab Duo Agent Platform.
- `pages/`: Vue components for different views
- `stores/`: Pinia stores for state management
- `router/`: Vue Router configuration
- `styles.scss`: Global styles for the application

This layer handles the user interface, state management, and business logic of the GitLab Duo Agent Platform feature.

## Troubleshooting

### Hot reloading not working

If your changes are not reflected in the VS Code host window when you are updating the `language-server` codebase,
consider the following.

1. Are your directories siblings? This means they are in the same parent directory. If they aren't, you need to pass the VS Code **relative** path of your machine to the command defined above.

1. When running the `language-server` watch script, are there any errors? Try running `bun run compile` to make sure there are no TypeScript errors.

1. In the `language-server` and `VSCode extension` projects, did you pull the latest `main` branches and run `bun install` in both?

1. Once VS Code host has started, show the `output` window (`CMD + SHIFT + U` on MacOS) and from the dropdown on the right, select `GitLab Language Server`. Are there any errors?

1. Open the Developer tools (`CMD + OPTION + I` on MacOS). Then click on the console tab and check if there are any errors

## Additional Resources

For more information about GitLab Duo Agent Platform, refer to the following documentation:

- [GitLab Duo Agent Platform User Guide](https://docs.gitlab.com/user/duo_workflow/)
- [GitLab Duo Agent Platform Development Guide](https://docs.gitlab.com/ee/development/duo_workflow/)
