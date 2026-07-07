---
name: testing
description: How to run tests and write tests in this project — unit, integration, CLI, test structure, fakes, and per-file
---

# Testing

## Test Commands

- **All tests**: `mise exec -- bun test` (runs unit + integration + CLI tests)
- **Unit tests only**: `mise exec -- bun run test:unit`
- **Integration tests**: `mise exec -- bun run test:integration`
- **CLI tests**: `mise exec -- bun run test:cli`
- **Watch mode**: `mise exec -- bun run test:unit:watch`

### Single test file

Auto-detects CLI/TUI workspace vs root jest config:

```bash
mise exec -- bun run test:file path/to/file.test.ts
```

### Pattern matching

```bash
# Run specific test file by pattern (escape dots — the pattern matches the full path including the worktree directory name)
mise exec -- bun run test:unit -- --testPathPattern='auth\.e2e\.test'

# Run all tests (quiet mode)
mise exec -- bun run test:unit -- --silent --reporters=summary
```

## Writing Unit Tests

Structure jest tests using `describe` blocks that represent a condition. Nest as many `describe` blocks as make sense for similar conditions to be grouped together:

```ts
// bad
it('shows an error when the network call fails', () => { .. }

it('shows an error when the user clicks on the wrong button', () => { .. }

// good
describe('when the network call fails', () => {
  beforeEach(() => { // setup here for this condition }

  it('shows an error', () => { }
}

describe('when the user clicks on the wrong button', () => {
  beforeEach(() => { // setup here for this condition }

  it('shows an error', () => { }
}
```

When creating fake implementations, use `createFakePartial<X>({property: value})` instead of `{} as X`.

## Verify (compile + test + lint)

```bash
./scripts/dev/verify.sh              # compile + all tests + lint
./scripts/dev/verify.sh --no-lint    # skip lint
./scripts/dev/verify.sh --no-test    # compile-only
```

## Compilation

- **TypeScript check**: `mise exec -- bun run compile`

## Build

Build before integration tests: `mise exec -- bun run build`

## Linting

- `mise exec -- bun run eslint`
- `mise exec -- bun run eslint:fix`

## Formatting

- **Check**: `mise exec -- bun run prettier`
- **Fix**: `mise exec -- bun run prettier:fix`
- **Fix all (eslint + prettier)**: `mise exec -- bun run autofix`
