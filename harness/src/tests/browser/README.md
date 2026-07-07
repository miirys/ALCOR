# Web Browser Testing

This directory contains integration tests for verifying Language Server features end-to-end in a web browser environment.
The language server process runs in a web worker and just like the e2e integration tests located in `src/tests/int`, the
web browser tests interact with the language server using the LSP RPC protocol.

## Test runner

We use [mocha](https://mochajs.org/#running-mocha-in-the-browser) to run the tests in the Web Browser

## Running integration tests

To run integration tests, execute:

```shell
bun run test:integration:browser
```

To run integration tests in watch mode:

```shell
bun run test:integration:browser:watch
```

Open the URL `http://localhost:9010`. The tests run automatically when the page loads. You can debug
the tests using the web browser's developer tools.

### Environment variables

The following are required environment variables:

1. `GITLAB_URL` GitLab instance to target in the tests.
1. `GITLAB_TEST_TOKEN` PAT used to authenticate API requests.
1. `GITLAB_PROJECT_PATH` project to target in the tests.

### LSP Client Browser

The integration tests use a custom `LspClientBrowser` class located in `lsp_client_browser.ts` that provides methods for:

- Starting and stopping the Language Server.
- Sending LSP protocol messages.
- Monitoring server output.
