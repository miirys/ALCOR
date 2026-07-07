# Duo CLI: Certificate & Proxy E2E Test Suite

> Single source of truth for the cert/proxy E2E tests in `packages/cli/test/e2e/network/`.

---

## Table of Contents

1. [Background: Why These Tests Exist](#background-why-these-tests-exist)
1. [Architecture: The Process Boundary Problem](#architecture-the-process-boundary-problem)
1. [Critical Connections](#critical-connections)
1. [Connection Types in the Language Server](#connection-types-in-the-language-server)
1. [Certificate Configuration Methods](#certificate-configuration-methods)
1. [Proxy Configuration Methods](#proxy-configuration-methods)
1. [Test Infrastructure](#test-infrastructure)
1. [Test Scenario Taxonomy](#test-scenario-taxonomy)
1. [Implemented Tests](#implemented-tests)
1. [Test Gaps](#test-gaps)
1. [Regression Tests](#regression-tests)
1. [Known Product Bugs](#known-product-bugs)
1. [Test Targets: Node Bundle vs Compiled Binary](#test-targets-node-bundle-vs-compiled-binary)
1. [Running the Tests](#running-the-tests)
1. [CI Integration](#ci-integration)
1. [File Map](#file-map)
1. [Historical Context](#historical-context)
1. [Adding New Tests: Checklist](#adding-new-tests-checklist)
1. [References](#references)

---

## Background: Why These Tests Exist

The GitLab Duo CLI runs a headless Language Server process. Unlike IDE extensions (which benefit from Chromium/Electron's automatic certificate and proxy handling), the CLI uses a plain Node.js network stack that must be explicitly configured for custom certificates and proxies.

Over 3 years (2023–2026), this architectural gap produced **83 issues and 34 MRs** across `gitlab-lsp` and `gitlab-vscode-extension`. Every new network subsystem added to the LS (WebSocket, MCP, Git subprocess) shipped without proxy/cert support and was later fixed via customer escalation.

These tests exist to **catch regressions before they reach customers**. They hit real GitLab production services — not mocks — because cert/proxy bugs happen at the TLS handshake layer, below where API mocks operate.

---

## Architecture: The Process Boundary Problem

```plaintext
┌────────────────────────────────────────────────────────────────┐
│  IDE (VS Code, JetBrains)                                      │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  IDE Extension                                            │  │
│  │  - Uses IDE network stack (Chromium/Electron for VS Code) │  │
│  │  - Reads VS Code http.proxy / IDE proxy settings         │  │
│  │  - Has access to OS certificate store (via IDE runtime)   │  │
│  └────────────────────┬─────────────────────────────────────┘  │
│                        │ LSP (stdin/stdout or TCP)              │
│  ┌─────────────────────▼─────────────────────────────────────┐  │
│  │  Language Server (Node.js subprocess)                     │  │
│  │  - SEPARATE PROCESS with its own network stack            │  │
│  │  - Does NOT share Chromium/Electron certificate trust     │  │
│  │  - Must be explicitly configured for certs and proxies   │  │
│  └───────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────┘
```

**The key insight**: The Language Server is a Node.js child process. It does not inherit the IDE's network trust or proxy configuration. Every network subsystem within the LS must be explicitly configured. This explains:

- Why IDE features work but Duo AI features fail (different network stacks)
- Why each new network feature ships with its own cert/proxy bug
- Why `--use-system-ca` is important (lets Node.js runtime load OS certs)
- Why the undici/cross-fetch problem matters for MCP (incompatible `dispatcher` vs `agent` patterns)

---

## Critical Connections

All test scenarios must exercise these three connection types. A happy-path test passes only when all three succeed.

### C1: HTTPS to GitLab Monolith

REST API calls (`/api/v4/...`), token validation, project operations. Used by all CLI operations on startup. The first network call is always the PAT self-check (`GET /api/v4/personal_access_tokens/self`).

**Success signal in tests**: `waitForWelcomeMessage()` — the CLI displays `User: @username` after a successful token check.

### C2: HTTPS to AI Gateway

The AI Gateway (`cloud.gitlab.com`) handles LLM inference. The CLI talks to it through the GitLab instance for most operations (monolith proxies the calls).

**Success signal in tests**: `waitForDuoResponse()` — the CLI receives and displays an AI-generated chat response.

### C3: WebSocket to GitLab (Agentic Chat / Duo Workflow)

Duo Agent Platform streaming uses `wss://` WebSocket to GitLab ([vscode-extension!2947](https://gitlab.com/gitlab-org/gitlab-vscode-extension/-/merge_requests/2947)). This is a **separate code path** from REST — the `ws` library's `agent` option is independent from `node-fetch`'s agent. WebSocket connections have repeatedly been the first thing to break when proxy/cert support is added.

**Runtime divergence (Target B / Bun binary)**: Bun's native WebSocket does **not** honor Node's `agent` option for `ws://` targets and its `proxy:` option doesn't tunnel through HTTPS MITM proxies. The compiled binary therefore routes WebSocket proxying via a scheme-aware heuristic (`http://` proxy → Bun `proxy:`, `https://` proxy → Node `agent`), translated in `@gitlab-org/fetch` ([lsp!3416](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/-/merge_requests/3416)). C3 through a proxy is therefore validated on **both** targets independently in CI — a passing node-bundle run does not imply the Bun binary works, so the suite runs once per runtime (see [CI Integration](#ci-integration)).

**Success signal in tests**: `waitForDuoResponse()` — the streaming chat response arrives via WebSocket.

**Why a single chat turn covers all three**: `waitForWelcomeMessage()` exercises C1 (token check). `sendMessage('hi')` + `waitForDuoResponse()` exercises C2 (AI inference) and C3 (WebSocket streaming for the response). When the interceptor is in MITM proxy mode, it sits between the CLI and every upstream host, so all three connections traverse the interceptor.

---

## Connection Types in the Language Server

The LS makes multiple distinct outbound connection types, each with independent proxy/cert handling:

| Connection Type                  | Library              | Used For                   | Cert Support                                                                                                                                                                                        | Proxy Support                                                                                         |
| -------------------------------- | -------------------- | -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| REST API (HTTPS)                 | `cross-fetch`        | GitLab API, token checks   | ✅ via `https.Agent`                                                                                                                                                                                | ✅ via `ProxyAgent`                                                                                   |
| GraphQL (HTTPS)                  | `cross-fetch`        | GraphQL queries            | ✅                                                                                                                                                                                                  | ✅                                                                                                    |
| GraphQL Subscription (WebSocket) | `ws` via `@anycable` | Duo Chat streaming         | ✅ Fixed [lsp!1929](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/-/merge_requests/1929)                                                                                               | ✅                                                                                                    |
| Duo Agent Platform WebSocket     | `ws`                 | Agentic Chat streaming     | ✅ Fixed [lsp!2068](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/-/merge_requests/2068), [lsp!2819](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/-/merge_requests/2819) | ✅                                                                                                    |
| Direct Connection Client         | `cross-fetch`        | Code Suggestions fast path | ✅ Fixed [lsp!1931](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/-/merge_requests/1931)                                                                                               | ✅                                                                                                    |
| MCP (HTTP SSE)                   | `undici`             | Remote MCP servers         | ✅ Fixed [lsp!2509](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/-/merge_requests/2509), [lsp!2555](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/-/merge_requests/2555) | ✅                                                                                                    |
| MCP (stdio)                      | OS subprocess        | Local MCP servers          | N/A                                                                                                                                                                                                 | ⚠️ Open [lsp#1691](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/-/issues/1691)          |
| Git subprocess                   | OS subprocess        | Node executor Git ops      | N/A                                                                                                                                                                                                 | ✅ Fixed [lsp!2589](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/-/merge_requests/2589) |

---

## Certificate Configuration Methods

These are the ways a customer can configure the CLI to trust a non-public CA:

### 1. System Certificate Store (`--use-system-ca`) — Recommended for desktop

Pass the `--use-system-ca` Node.js flag to include OS-trusted CAS. The compiled binary has this baked in at compile time. Requires Node.js ≥ 22.15.0.

- VS Code: auto-passed when Node ≥ 22.15.0 ([vscode-extension!2941](https://gitlab.com/gitlab-org/gitlab-vscode-extension/-/merge_requests/2941))
- CLI binary: compiled with `--compile-exec-argv="--use-system-ca"` ([lsp!2834](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/-/merge_requests/2834))
- **Known limitation**: Inconsistent across machines (documented in vscode-extension!2941)

### 2. Custom CA file (`NODE_EXTRA_CA_CERTS`) — Recommended for headless/CLI

Set `NODE_EXTRA_CA_CERTS=/path/to/ca.pem`. This **appends** to the built-in CA bundle (unlike `gitlab.ca` which replaces it — see [Known Product Bugs](#known-product-bugs)).

### 3. Disable verification (`NODE_TLS_REJECT_UNAUTHORIZED=0`) — Insecure

Disables all TLS validation. Only for debugging.

### 4. `gitlab.ca` setting — Has a known bug

Points to a PEM file, but **replaces** the entire Node.js CA bundle. This breaks connections to `cloud.gitlab.com` (AI Gateway) which uses a public CA. Tracked in [lsp#1339](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/-/issues/1339), [vscode-extension#2077](https://gitlab.com/gitlab-org/gitlab-vscode-extension/-/issues/2077). Draft fix in [lsp!2939](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/-/merge_requests/2939).

---

## Proxy Configuration Methods

The LS reads proxy config from:

1. **Environment variables**: `http_proxy`, `https_proxy`, `HTTP_PROXY`, `HTTPS_PROXY`, `no_proxy`, `NO_PROXY`
1. **VS Code setting**: `http.proxy` — forwarded to LS as env vars ([vscode-extension!2121](https://gitlab.com/gitlab-org/gitlab-vscode-extension/-/merge_requests/2121))
1. **`get-proxy-settings` library**: Reads Windows registry proxy settings (archived library, has bugs — see [Known Product Bugs](#known-product-bugs))

The LS creates a `ProxyAgent` (from `proxy-agent` npm) when proxy env vars are present. Authenticated proxies use URL-embedded credentials: `http://user:pass@proxy:8080`.

---

## Test Infrastructure

### mockttp Interceptor

The test infrastructure uses [mockttp](https://github.com/httptoolkit/mockttp) as a programmable HTTPS MITM proxy. It runs in a **subprocess** because Jest's module loader cannot handle mockttp's CJS/ESM dependency mix.

```plaintext
interceptor_proc.mjs:
  1. Generate ephemeral test CA certificate + key
  2. Start mockttp with that CA
  3. Configure: forAnyRequest().thenPassThrough() + forAnyWebSocket().thenPassThrough()
  4. Emit { url, caCertPath } as JSON on stdout
  5. Stay alive until SIGTERM
```

The parent process (`NetworkInterceptor` class in `interceptor.ts`) spawns this, parses the JSON output, and provides `proxyUrl` and `caCertPath` to tests.

### Test CA Requirements

- Genuine X.509 CA certificate (not a wildcard leaf cert)
- **Not** in the default Node.js CA bundle or OS trust store
- Written to a temp directory, cleaned up on teardown
- Fresh CA generated per interceptor instance

### How a Test Exercises All Three Connections

```plaintext
1. Start NetworkInterceptor (mockttp MITM proxy)
2. Launch Duo CLI with HTTPS_PROXY=<interceptor> + NODE_EXTRA_CA_CERTS=<test-ca.pem>
3. waitForWelcomeMessage()  → C1: CLI does PAT self-check via HTTPS through proxy
4. sendMessage('hi')        → C2: Chat request goes to AI Gateway through proxy
5. waitForDuoResponse()     → C3: Streaming response arrives via WebSocket through proxy
6. Tear down CLI + interceptor
```

### Interceptor Modes

| Mode                        | Implementation              | What It Does                                                   |
| --------------------------- | --------------------------- | -------------------------------------------------------------- |
| HTTPS MITM proxy            | `startAsMitmProxy()` ✅     | Terminates CLI TLS with test CA, re-establishes upstream TLS   |
| TLS terminator              | `startAsTlsTerminator()` ✅ | Same as above; CLI points `--gitlab-base-url` at it            |
| Authenticated CONNECT proxy | ❌ Deferred                 | mockttp doesn't natively gate CONNECT on `Proxy-Authorization` |

---

## Test Scenario Taxonomy

Scenarios are organized along two axes: **certificate configuration** and **proxy configuration**.

### Axis 1: Certificate Configuration

| ID           | Name                        | Customer Configuration                   | Expected     |
| ------------ | --------------------------- | ---------------------------------------- | ------------ |
| **CA-1**     | Public CA (baseline)        | Nothing                                  | ✅ Works     |
| **CA-2**     | Custom CA via file          | `NODE_EXTRA_CA_CERTS=/path/to/ca.pem`    | ✅ Works     |
| **CA-3**     | System CA                   | `--use-system-ca` + CA in OS trust store | ✅ Works     |
| **CA-4**     | Disable verification        | `NODE_TLS_REJECT_UNAUTHORIZED=0`         | ✅ Works     |
| **CA-NEG-1** | No config, custom CA needed | Nothing, interceptor uses test CA        | ❌ TLS error |
| **CA-NEG-2** | Wrong CA configured         | Wrong `NODE_EXTRA_CA_CERTS`              | ❌ TLS error |

### Axis 2: Proxy Configuration

| ID            | Name                           | Configuration                             | Expected            |
| ------------- | ------------------------------ | ----------------------------------------- | ------------------- |
| **PRX-1**     | No proxy                       | Nothing                                   | ✅ Works            |
| **PRX-2**     | HTTP proxy (no auth)           | `HTTPS_PROXY=http://proxy:port`           | ✅ Works            |
| **PRX-3**     | Authenticated proxy            | `HTTPS_PROXY=http://user:pass@proxy:port` | ✅ Works            |
| **PRX-4**     | `NO_PROXY` bypass              | `NO_PROXY=some-host`                      | ✅ Selective bypass |
| **PRX-NEG-1** | Missing proxy (direct blocked) | None, direct blocked                      | ❌ Connection error |
| **PRX-NEG-2** | Bad credentials                | Wrong credentials                         | ❌ HTTP 407         |

### Combined: MITM Proxy (Most Common Enterprise Case)

| ID             | Name                      | Configuration                                    |
| -------------- | ------------------------- | ------------------------------------------------ |
| **MITM-1**     | MITM proxy + file CA      | `HTTPS_PROXY` + `NODE_EXTRA_CA_CERTS`            |
| **MITM-2**     | MITM proxy + system CA    | `HTTPS_PROXY` + `--use-system-ca` + OS install   |
| **MITM-3**     | MITM proxy + insecure     | `HTTPS_PROXY` + `NODE_TLS_REJECT_UNAUTHORIZED=0` |
| **MITM-4**     | Auth MITM proxy + CA      | `user:pass@proxy` + `NODE_EXTRA_CA_CERTS`        |
| **MITM-NEG-1** | MITM, no CA (fail)        | `HTTPS_PROXY` only                               |
| **MITM-NEG-2** | Right CA, no proxy (fail) | `NODE_EXTRA_CA_CERTS` only, direct blocked       |

---

## Implemented Tests

All tests live in `packages/cli/test/e2e/network/network.e2e.test.ts`. Each is parameterized over CLI targets (node-bundle, compiled binary).

| Test                                                | Scenario ID  | Connections | Status |
| --------------------------------------------------- | ------------ | ----------- | ------ |
| CA-1: direct connection, public CA                  | CA-1 + PRX-1 | C1+C2+C3    | ✅     |
| MITM-1: MITM proxy + NODE_EXTRA_CA_CERTS            | MITM-1       | C1+C2+C3    | ✅     |
| MITM-3: MITM proxy + NODE_TLS_REJECT_UNAUTHORIZED=0 | MITM-3       | C1+C2+C3    | ✅     |
| PRX-2: HTTP CONNECT proxy + CA trusted              | PRX-2        | C1          | ✅     |
| REG-004: NODE_EXTRA_CA_CERTS appends to bundled CAS | Regression   | C1+C2+C3    | ✅     |
| REG-006: only HTTP_PROXY set → no crash             | Regression   | C1          | ✅     |
| MITM-NEG-1: no CA → TLS error                       | MITM-NEG-1   | —           | ✅     |
| CA-NEG-2: wrong CA → TLS error                      | CA-NEG-2     | —           | ✅     |

---

## Test Gaps

These scenarios from the taxonomy are **not yet implemented**:

### High Priority

| Gap                                      | Why Not Implemented                                                                   | What's Needed                                                                                                    |
| ---------------------------------------- | ------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| **CA-2** (pure custom CA, no proxy)      | Needs mockttp as TLS terminator via `--gitlab-base-url`. Partially covered by MITM-1. | Point CLI at mockttp URL as fake GitLab.com, test token check only (C1)                                          |
| **PRX-3 / MITM-4** (authenticated proxy) | mockttp doesn't natively gate CONNECT on `Proxy-Authorization`                        | Custom CONNECT handler on top of mockttp, or swap to `tinyproxy` (already used in `src/tests/int/fetch.test.ts`) |
| **REG-002** (Direct Connection Client)   | MITM-1 covers C2 via chat, but Code Suggestions use a different code path             | Add a Code Suggestion–specific test (not just chat)                                                              |

### Medium Priority

| Gap                                                        | Why Not Implemented                                                                                           | What's Needed                                                                 |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| **CA-3 / MITM-2** (system CA)                              | Docker-dependent — needs `ca-certificates` + `update-ca-certificates`. Can't safely modify macOS trust store. | Docker container with helpers: `installSystemCa(pem)` / `uninstallSystemCa()` |
| **CA-4** (pure `NODE_TLS_REJECT_UNAUTHORIZED=0`, no proxy) | Trivially covered by MITM-3 but not explicitly standalone                                                     | Add TLS terminator variant                                                    |
| **PRX-NEG-2** (bad proxy credentials)                      | Depends on authenticated proxy implementation                                                                 | Implement after PRX-3                                                         |

### Low Priority / Structural Limitations

| Gap                                                     | Why Deferred                                                                                     |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| **PRX-NEG-1 / MITM-NEG-2** (direct connections blocked) | Need network-level egress blocking (iptables / network namespace) — outside test process control |
| **PRX-4** (`NO_PROXY` bypass)                           | Needs per-host structured log inspection to verify selective routing                             |
| **MCP proxy/cert**                                      | Separate feature, lower priority, newer code                                                     |

---

## Regression Tests

Seven named regressions from historical bugs:

| ID          | Bug                                             | Fix MR                                                                                                                                                                                     | Test Coverage                                                           |
| ----------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------- |
| **REG-001** | Proxy initialized after first token check       | [lsp!306](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/-/merge_requests/306)                                                                                                 | Covered by MITM-1 (token check succeeds on first attempt through proxy) |
| **REG-002** | Direct Connection Client not using `lsFetch`    | [lsp!1931](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/-/merge_requests/1931)                                                                                               | **Gap** — needs Code Suggestion–specific test                           |
| **REG-003** | WebSocket connections ignoring proxy/cert       | [lsp!2068](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/-/merge_requests/2068), [lsp!2819](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/-/merge_requests/2819) | Covered by MITM-1/MITM-3 (C3 WebSocket through MITM)                    |
| **REG-004** | Custom CA must not break public-CA connections  | [vscode-extension#2077](https://gitlab.com/gitlab-org/gitlab-vscode-extension/-/issues/2077)                                                                                               | ✅ Explicit test                                                        |
| **REG-005** | Streaming requests bypassing proxy              | [lsp!227](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/-/merge_requests/227)                                                                                                 | Covered by MITM-1 (chat response = streaming through proxy)             |
| **REG-006** | `get-proxy-settings` crash on `HTTP_PROXY` only | [lsp!2819](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/-/merge_requests/2819)                                                                                               | ✅ Explicit test                                                        |
| **REG-007** | Bun binary WebSocket ignores `agent` for proxy  | [lsp!3416](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/-/merge_requests/3416)                                                                                               | ✅ MITM-1/MITM-3 run against the Bun binary in CI (`cli-network-e2e-bun`), exercising C3 through the proxy |

---

## Known Product Bugs

### `get-proxy-settings` silently bypasses proxy

**Location**: `packages/lib_fetch/src/node/fetch.ts`

When only `HTTPS_PROXY` (without `HTTP_PROXY`) is set, the archived `get-proxy-settings` library throws `TypeError: Cannot read properties of null (reading 'host')` because it calls `new ProxySetting(null)` for the missing HTTP proxy. `Fetch.initialize()` catches this, and then the lowercase `process.env.https_proxy` check fails because `getProxySettings()` never normalized the casing. Result: the CLI creates a plain `Agent` instead of `EnvHttpProxyAgent` and **silently bypasses the proxy**.

**Impact**: Any user who sets only `HTTPS_PROXY` without `HTTP_PROXY` will have their proxy silently ignored.

**Workaround in tests**: `cli_launcher.ts` sets both `HTTP_PROXY` and `HTTPS_PROXY`.

### `gitlab.ca` replaces (not appends to) bundled CAS

When `gitlab.ca` is set, it completely replaces Node.js's built-in CA bundle. Connections to `cloud.gitlab.com` (AI Gateway) and `duo-workflow.runway.gitlab.net` (Workflow Service) fail because those use public CAS.

Fix tracked in [lsp#1339](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/-/issues/1339), draft [lsp!2939](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/-/merge_requests/2939).

---

## Test Targets: Node Bundle vs Compiled Binary

Every test is parameterized over two CLI forms:

| Feature                        | Node bundle (`node dist/index.js`) | Compiled binary (`bin/duo-*`)                    |
| ------------------------------ | ---------------------------------- | ------------------------------------------------ |
| Runtime                        | Node.js                            | Bun (via `bun build --compile`)                  |
| `--use-system-ca`              | Must pass via `NODE_OPTIONS`       | Baked in at compile time (`--compile-exec-argv`) |
| `NODE_EXTRA_CA_CERTS`          | ✅                                 | ✅ (confirmed by spike)                          |
| `NODE_TLS_REJECT_UNAUTHORIZED` | ✅                                 | ✅ (confirmed by spike)                          |
| `HTTPS_PROXY` / `HTTP_PROXY`   | ✅                                 | ✅ HTTPS via fetch (spike); WS via heuristic     |

The compiled binary is **not** a Node.js SEA — it's Bun-compiled. See `packages/cli/scripts/compile_executables.ts`.

Locally, Target B (binary) tests are auto-skipped when the binary isn't present — build it with `bun run --filter @gitlab/duo-cli build:dev-binary`. In CI each runtime runs as its own job, forced via the `NETWORK_E2E_TARGET=node-bundle|binary` env var (see [CI Integration](#ci-integration)); when set, the chosen target is never skipped, so a missing binary fails the job loudly.

Spike results confirming Bun binary env-var support are in `packages/cli/test/e2e/network/spikes/README.md`. The spike only covered plain `fetch` (C1/C2); Bun WebSocket-through-proxy (C3) is a separate path fixed in [lsp!3416](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/-/merge_requests/3416) and is now exercised against the Bun binary by the `cli-network-e2e-bun` CI job (MITM-1/MITM-3, closing REG-007).

---

## Running the Tests

```shell
# Full suite (node-bundle only if binary not built)
export GITLAB_TEST_TOKEN=glpat-...
bun run --filter @gitlab/duo-cli test:network-e2e

# Single scenario
bun run --filter @gitlab/duo-cli test:network-e2e -- -t 'MITM-1'

# With compiled binary (Target B)
bun run --filter @gitlab/duo-cli build:dev-binary
bun run --filter @gitlab/duo-cli test:network-e2e

# Force a single runtime (what CI does — one job per target)
bun run --filter @gitlab/duo-cli test:network-e2e:node   # node-bundle only
bun run --filter @gitlab/duo-cli test:network-e2e:bun    # Bun binary only (must be built first)
```

### Requirements

- Node.js ≥ 22.15.0
- `GITLAB_TEST_TOKEN`: PAT with Duo entitlements on GitLab.com
- Outbound HTTPS to `gitlab.com` and `cloud.gitlab.com`
- `tmux` installed (tests use `TmuxTerminalTest`)

### Timing

- Happy-path tests: ~15–30 seconds each
- Negative tests: ~10–20 seconds each
- Full suite (8 tests, node-bundle): ~3–5 minutes
- With Target B: ~6–10 minutes

### Reliability

Deterministic parts: CA generation, interceptor startup, CLI launch, env var configuration.

Variable parts: GitLab.com availability, AI Gateway response time, CI runner network. The 120-second per-test timeout mitigates transient slowness.

---

## CI Integration

The suite runs **once per CLI runtime** so both the shipped runtimes are
exercised against the real cert/proxy/WebSocket code paths. Two jobs run in
parallel in `.gitlab-ci.yml`:

| Job                    | Runtime / Target          | How the CLI is provided                                                   |
| ---------------------- | ------------------------- | ------------------------------------------------------------------------- |
| `cli-network-e2e-node` | Node.js (`node-bundle`)   | Builds the JS bundle in-job (`turbo bundle` → `dist/index.js`)            |
| `cli-network-e2e-bun`  | Bun binary (`binary`)     | Consumes the `build_cli_binaries_artifact-unsigned` artifact (no rebuild) |

Each job forces a single target via the `NETWORK_E2E_TARGET` env var (set by
the `test:network-e2e:node` / `test:network-e2e:bun` package scripts), so the
test bodies stay runtime-agnostic — no per-target branching leaks into the
tests. The Bun job depends on the existing binary-build artifact rather than
recompiling, keeping wall-clock time down.

Both jobs are currently `allow_failure: true` and gated on
`.run_when_has_token_or_on_merge_train` (run only when `GITLAB_TEST_TOKEN` is
present or on a merge train). Remove `allow_failure` once stable in CI.

```yaml
cli-network-e2e-node:
  extends: .run_when_has_token_or_on_merge_train
  stage: test
  needs: []
  before_script:
    - *bun_install
  script:
    - bun run --filter @gitlab/duo-cli test:network-e2e:node
  allow_failure: true

cli-network-e2e-bun:
  extends: .run_when_has_token_or_on_merge_train
  stage: test
  needs:
    - job: build_cli_binaries_artifact-unsigned
      artifacts: true
  variables:
    DUO_CLI_BINARY_PATH: packages/cli/bin/duo-linux-x64
  before_script:
    - test -x "$DUO_CLI_BINARY_PATH" || { echo "Pre-built binary missing"; exit 1; }
    - *bun_install
  script:
    - bun run --filter @gitlab/duo-cli test:network-e2e:bun
  allow_failure: true
```

### Notes / future work

- `GITLAB_TEST_TOKEN` must exist as a protected CI variable (already used by
  the other `*-e2e` jobs).
- The default `ci-node` image already provides Node.js ≥ 22.15.0, the pinned
  Bun (`mise/config.toml`), and `tmux`.
- The Bun binary is standalone (Bun runtime embedded), so the Bun job does not
  need a separate Bun install to *run* it.
- For CA-3/MITM-2 (system CA): would need a Docker image with the
  `ca-certificates` package + `update-ca-certificates` — not yet implemented.

---

## File Map

```plaintext
packages/cli/test/e2e/network/
├── network.e2e.test.ts          # Main test file (8 scenarios, parameterized over targets)
├── README.md                     # Quick-start, known bugs, deferred items
├── helpers/
│   ├── interceptor.ts            # NetworkInterceptor class (subprocess wrapper)
│   ├── interceptor_proc.mjs      # Standalone mockttp MITM proxy process
│   ├── cli_launcher.ts           # launchCliWithNetwork() + getCompiledBinaryPath()
│   └── log_reader.ts             # CLI log file reader for negative tests
└── spikes/
    ├── README.md                 # Bun binary env-var spike results
    ├── spike.ts                  # Minimal fetch program for spike
    ├── server.mjs                # mockttp HTTPS server for spike
    └── server-proxy.mjs          # mockttp MITM proxy for spike

docs/ai/
└── cert-proxy.md                 # This document (SSOT)
```

---

## Historical Context

The cert/proxy problem has evolved through five eras:

| Era            | Period  | Key Event                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| -------------- | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Extension-only | 2018    | First custom CA support in vscode-extension ([!8](https://gitlab.com/gitlab-org/gitlab-vscode-extension/-/merge_requests/8))                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| SSL Mess       | 2021    | SSL setup spike; `gitlab.ca` deprecated ([vscode-extension!340](https://gitlab.com/gitlab-org/gitlab-vscode-extension/-/merge_requests/340), authored by @viktomas)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| LS Era Begins  | 2023    | `LsFetch` + proxy support ([lsp!35](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/-/merge_requests/35)); `ignoreCertificateErrors` ([lsp!211](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/-/merge_requests/211))                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Filling Gaps   | 2024    | Proxy race condition fix ([lsp!306](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/-/merge_requests/306)); proxy auth ([lsp!1020](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/-/merge_requests/1020)); VS Code proxy passthrough ([vscode-extension!2121](https://gitlab.com/gitlab-org/gitlab-vscode-extension/-/merge_requests/2121))                                                                                                                                                                                                                                                                                                                                                                                                                |
| WebSocket + AI | 2025–26 | WebSocket proxy/cert fixes ([lsp!2068](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/-/merge_requests/2068), [lsp!2819](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/-/merge_requests/2819)); `--use-system-ca` ([vscode-extension!2941](https://gitlab.com/gitlab-org/gitlab-vscode-extension/-/merge_requests/2941)); MCP cert/proxy ([lsp!2509](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/-/merge_requests/2509), [lsp!2555](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/-/merge_requests/2555)); Duo CLI cert support ([lsp!2754](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/-/merge_requests/2754), [lsp!2834](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/-/merge_requests/2834)); Bun binary WebSocket proxy heuristic ([lsp!3416](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/-/merge_requests/3416)) |

---

## Adding New Tests: Checklist

When adding a new cert/proxy test scenario:

1. **Identify which taxonomy cell** it covers (CA-x × PRX-x or MITM-x)
1. **Choose interceptor mode**: MITM proxy (covers C1+C2+C3) or TLS terminator (covers C1 only)
1. **Set env vars** via `launchCliWithNetwork()` options — don't set them manually
1. **Remember the `get-proxy-settings` bug**: if using a proxy, set **both** `HTTP_PROXY` and `HTTPS_PROXY` (the launcher does this automatically when `useAsProxy: true`)
1. **For negative tests**: use `chat.terminal.waitForMatch(TLS_ERROR_PATTERN)` to verify TLS errors appear in the terminal, and assert no `uncaught exception`
1. **Update this document**: add to the [Implemented Tests](#implemented-tests) table and remove from [Test Gaps](#test-gaps)
1. **Update the test file comments**: each test has a doc comment referencing this document

### Checklist for new LS network subsystems

Every new network channel in the Language Server should:

- [ ] Use `LsFetch` (or receive an `https.Agent`/`ProxyAgent`) for HTTPS
- [ ] Pass the agent to WebSocket connections via the `agent` option
- [ ] For undici-based fetch: use `EnvHttpProxyAgent` as `dispatcher` with `requestTls.ca`
- [ ] For subprocesses: forward proxy + cert env vars to child process
- [ ] Respect configuration updates (reinitialize on cert/proxy config change)
- [ ] Log proxy and certificate configuration on startup

---

## References

### Key Issues (Open)

- [lsp#1339](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/-/issues/1339) — `gitlab.ca` replaces bundled CAS
- [lsp#1780](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/-/issues/1780) — JetBrains trust store → LS
- [lsp#36](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/-/issues/36) — Windows certificate trust store
- [lsp#548](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/-/issues/548) — Bearer/token proxy auth
- [lsp#1691](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/-/issues/1691) — MCP stdio proxy env vars
- [lsp#927](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/-/issues/927) — WebSocket custom certificates
- [vscode-extension#2077](https://gitlab.com/gitlab-org/gitlab-vscode-extension/-/issues/2077) — Certificate trust store issues

### Key MRs (Merged)

- [lsp!35](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/-/merge_requests/35) — Original LsFetch + proxy
- [lsp!306](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/-/merge_requests/306) — Proxy init race condition fix
- [lsp!1020](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/-/merge_requests/1020) — Proxy authentication
- [lsp!1931](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/-/merge_requests/1931) — Direct Connection Client fix
- [lsp!2068](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/-/merge_requests/2068) — WebSocket proxy/cert fix
- [lsp!2509](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/-/merge_requests/2509) — MCP proxy/cert
- [lsp!2819](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/-/merge_requests/2819) — WebSocket proxy settings
- [lsp!2834](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/-/merge_requests/2834) — CLI `--use-system-ca`
- [vscode-extension!2941](https://gitlab.com/gitlab-org/gitlab-vscode-extension/-/merge_requests/2941) — VS Code `--use-system-ca` passthrough
- [vscode-extension!2947](https://gitlab.com/gitlab-org/gitlab-vscode-extension/-/merge_requests/2947) — WebSocket default for Agent Platform
- [lsp!3416](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/-/merge_requests/3416) — Bun binary WebSocket proxy scheme-aware heuristic

### Error Message Reference

| Error                                          | Likely Cause                         | Solution                                               |
| ---------------------------------------------- | ------------------------------------ | ------------------------------------------------------ |
| `unable to verify the first certificate`       | CA chain incomplete / untrusted      | Install CA to OS trust store or `NODE_EXTRA_CA_CERTS`  |
| `self-signed certificate in certificate chain` | Self-signed cert, issuer untrusted   | Install CA                                             |
| `certificate has expired`                      | Server cert expired                  | Server-side fix; `NODE_TLS_REJECT_UNAUTHORIZED=0` temp |
| `unable to get local issuer certificate`       | Corporate MITM proxy CA untrusted    | Install proxy CA                                       |
| `407 Authentication Required`                  | Proxy needs credentials              | `http://user:pass@proxy:8080`                          |
| `ECONNRESET`                                   | Connection dropped, proxy timeout    | Check `NO_PROXY`, proxy keep-alive                     |
| `DisconnectedError` (`@anycable`)              | WebSocket closed, missing proxy/cert | Ensure LS ≥ 8.2.0                                      |
| `fetch failed` (undici)                        | Cert error in undici fetch (MCP)     | Check `requestTls.ca` config                           |
