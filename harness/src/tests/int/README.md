# Integration Testing

This directory contains integration tests for verifying Language Server features end-to-end.
These tests start the actual Language Server process and test it through the Language Server Protocol interface.

## Running integration tests

To run integration tests with a fresh build, run:

```shell
bun run test:build:integration
```

To run integration tests without a fresh build, run:

```shell
bun run test:integration
```

To run Git-related integration tests, set the `TEST_GIT_INTEGRATION` environment variable:

```shell
export TEST_GIT_INTEGRATION=true
bun run test:integration:git
```

These tests create controlled Git repositories on-the-fly to test repository discovery, file listing, gitignore handling, and file change detection. They run quickly (under 30 seconds) and don't require cloning external repositories.

### Environment variables

Most tests make requests to the GitLab API, and fail without authentication.

Prerequisites:

- The account used to create the PAT must have GitLab Duo features enabled for the tests to pass.
- Some tests also require flags to be set in the environment:
  - `VALIDATE_CI_AND_BUNDLE` - If set, the test validates that the bundle is packaged correctly.
    It also ensures node is compiled with the correct version.
  - `TEST_GIT_INTEGRATION` - If set, the test runs Git-related integration tests, like `RepositoryService`.

To do this:

1. Create a personal access token on `gitlab.com`.
1. Set the `GITLAB_TEST_TOKEN` environment variable to the value of your personal access token..

Some tests are OS-specific. For instance, we use `tinyproxy` on Linux to test proxy HTTP requests.

## Writing integration tests

Helpers and common code are available when writing integration tests.

### LSP Client

The integration tests use a custom `LspClient` class located in `lsp_client.ts` that provides methods for:

- Starting and stopping the Language Server.
- Sending LSP protocol messages.
- Monitoring server output.
- Simulating file changes.

### Custom Matchers

#### `toEventuallyContainChildProcessConsoleOutput`

This matcher helps test asynchronous console output from the language server, which is particularly useful when the output timing is non-deterministic.

The matcher will:

- Poll the language server's console output at regular intervals.
- Return success if the message is found within the timeout period.
- Fail with a descriptive message if the output is not found within the timeout period.

Example usage:

```typescript
await expect(lsClient).toEventuallyContainChildProcessConsoleOutput(
  `uri ${fileUri} was updated in the LRU cache`,
  timeoutMs, // Optional timeout in milliseconds
  intervalMs, // Optional polling interval in milliseconds
);
```
