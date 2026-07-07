# CLI E2E Tests

Runs the actual built GitLab Duo CLI binary in a real terminal environment using tmux via `./terminal_test_helper.ts`

## Assertions

Use custom jest matcher `toEventuallyMatchOutput` to assert expected output.

```ts
await expect(chat.terminal).toEventuallyMatchOutput(/Select an option:/, WAIT_TIMEOUT);
```

Use synchronous `expect()` only for secondary/negative checks after polling confirms the expected state:

```ts
await chat.waitForInitialisation();
expect(chat.terminal.getOutput()).not.toMatch(/Foo bar/);
```

## Page objects (`pages/`)

Represent user-facing application UI as Page Object Models. Extract the mechanics of interacting with the UI, waiting for network/terminal delays etc from the test suite itself.

- Selectors (e.g. regex matchers) should be defined inside page objects.
- Page object methods use `waitForMatch`/`waitForAbsence` internally for flow control — tests use `toEventuallyMatchOutput` for assertions

## Test design

- E2e tests are slow (overhead of starting full CLI instance). Consolidate related assertions into a single test when they follow a natural user flow, rather than one test per assertion.
- Every test must have at least one `expect()` call. Never rely solely on page object timeouts to verify behaviour.
