# CLI Network: Certificate & Proxy E2E Tests

End-to-end tests for Duo CLI outbound network handling (custom CA certificates, proxies,
MITM). **Full documentation**: [`docs/ai/cert-proxy.md`](../../../../../docs/ai/cert-proxy.md)
(the single source of truth for this test suite).

## Quick start

```sh
export GITLAB_TEST_TOKEN=glpat-...
bun run --filter @gitlab/duo-cli test:network-e2e

# Single scenario:
bun run --filter @gitlab/duo-cli test:network-e2e -- -t 'MITM-1'

# With compiled binary (Target B):
bun run --filter @gitlab/duo-cli build:dev-binary
bun run --filter @gitlab/duo-cli test:network-e2e

# Force one runtime (CI runs these as parallel jobs via NETWORK_E2E_TARGET):
bun run --filter @gitlab/duo-cli test:network-e2e:node   # node-bundle only
bun run --filter @gitlab/duo-cli test:network-e2e:bun    # Bun binary only (build it first)
```

Requires a real GitLab PAT with Duo entitlements. Tests hit production
`gitlab.com` + `cloud.gitlab.com` — no mocks.

## Implementation notes

- mockttp runs in a **subprocess** (`helpers/interceptor_proc.mjs`) to avoid
  Jest's module loader limitations with CJS/ESM deps.
- `chatPage.launch()` accepts `executable` and `prependArgs` for Target B.
- `helpers/log_reader.ts` provides `waitForLogMatch()` for negative tests.
- `moduleNameMapper` was removed from `jest.e2e.config.js` — mockttp's
  `require('lodash')` broke under the `lodash → lodash-es` remap.

For test scenarios, gaps, known bugs, architecture, and regression coverage,
see `docs/ai/cert-proxy.md`.
