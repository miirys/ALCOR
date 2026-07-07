import { existsSync } from 'node:fs';
import type { ChatPage } from '../pages/chat_page';
import {
  NetworkInterceptor,
  generateCaCert,
  cleanupCaCert,
  type CaCert,
} from './helpers/interceptor';
import {
  launchCliWithNetwork,
  getCompiledBinaryPath,
  type CliTarget,
} from './helpers/cli_launcher';
import { clearCliLogs } from './helpers/log_reader';

/**
 * Certificate & Proxy E2E tests for Duo CLI.
 *
 * Full documentation: docs/ai/cert-proxy.md (the SSOT for this test suite).
 *
 * These tests verify that the CLI correctly handles custom TLS certificates
 * and HTTP(S) proxies across all three critical connection types:
 *   C1: HTTPS to GitLab monolith (token check)
 *   C2: HTTPS to AI Gateway (chat inference)
 *   C3: WebSocket to GitLab (streaming response)
 *
 * All tests hit real GitLab services (gitlab.com + cloud.gitlab.com).
 * The interceptor (mockttp) runs as a local MITM proxy — it does not
 * mock API responses, it forwards traffic. This is intentional: cert/proxy
 * bugs happen at the TLS handshake layer, below where mocks operate.
 *
 * Timeouts are generous (120s) to absorb AI Gateway latency variance.
 */
const TEST_TIMEOUT = 120_000;

function hasCompiledBinary(): boolean {
  try {
    return existsSync(getCompiledBinaryPath());
  } catch {
    return false;
  }
}

/**
 * Resolve which CLI target(s) to run.
 *
 * - `NETWORK_E2E_TARGET=node-bundle|binary` forces a single target. CI uses
 *   this to fan the suite out into one job per runtime (see `.gitlab-ci.yml`
 *   jobs `cli-network-e2e-node` / `cli-network-e2e-bun`). The `binary` target
 *   does NOT silently fall back when the binary is missing — it asserts via
 *   the existence check in `launchCliWithNetwork` so a misconfigured CI job
 *   fails loudly rather than skipping the Bun path (REG-007).
 * - Unset (local default): run `node-bundle`, plus `binary` only when a
 *   compiled binary is present. Build it with
 *   `bun run --filter @gitlab/duo-cli build:dev-binary`.
 *
 * Spike results in network/spikes/README.md confirm Bun honours all cert/proxy
 * env vars. See docs/ai/cert-proxy.md § "Test Targets".
 */
function resolveTargets(): CliTarget[] {
  const override = process.env.NETWORK_E2E_TARGET?.trim();
  if (override === 'node-bundle' || override === 'binary') {
    return [override];
  }
  if (override) {
    throw new Error(
      `Invalid NETWORK_E2E_TARGET "${override}". Expected "node-bundle" or "binary".`,
    );
  }
  return ['node-bundle', ...(hasCompiledBinary() ? (['binary'] as const) : [])];
}

const TARGETS: CliTarget[] = resolveTargets();

describe('CLI Network: Certificate & Proxy E2E', () => {
  describe.each(TARGETS)('Target: %s', (target) => {
    let chat: ChatPage | undefined;
    let interceptor: NetworkInterceptor | undefined;
    /** Standalone CA certs that must be cleaned up after the test. */
    const standaloneCaCerts: CaCert[] = [];

    afterEach(async () => {
      if (chat) {
        chat.cleanup();
        chat = undefined;
      }
      if (interceptor) {
        await interceptor.stop();
        interceptor = undefined;
      }
      for (const cert of standaloneCaCerts) {
        cleanupCaCert(cert);
      }
      standaloneCaCerts.length = 0;
    });

    describe('Group A: happy paths', () => {
      /**
       * CA-1 + PRX-1: Baseline — direct connection, public CA, no proxy.
       * Verifies the CLI works out of the box against real gitlab.com.
       * Exercises C1 (token check) + C2 (AI inference) + C3 (WebSocket stream).
       * See docs/ai/cert-proxy.md § "Implemented Tests".
       */
      it(
        'CA-1: direct connection, public CA, no proxy',
        async () => {
          chat = launchCliWithNetwork({ target });
          await chat.waitForWelcomeMessage();
          await chat.sendMessage('hi');
          await chat.waitForDuoResponse();
        },
        TEST_TIMEOUT,
      );

      /**
       * MITM-1: The most important enterprise scenario.
       * A corporate MITM proxy (ZScaler, SSL inspection firewall) terminates
       * TLS and re-signs with its own CA. The CLI must trust that CA via
       * NODE_EXTRA_CA_CERTS. Exercises all three connections (C1+C2+C3)
       * through the MITM proxy.
       * Also covers REG-001 (proxy init before token check), REG-003
       * (WebSocket through proxy), and REG-005 (streaming through proxy).
       * See docs/ai/cert-proxy.md § "Combined: MITM Proxy".
       */
      it(
        'MITM-1: HTTPS MITM proxy + NODE_EXTRA_CA_CERTS — full C1+C2+C3',
        async () => {
          interceptor = new NetworkInterceptor();
          await interceptor.startAsMitmProxy();
          chat = launchCliWithNetwork({
            target,
            interceptor,
            useAsProxy: true,
            nodeExtraCaCerts: interceptor.caCertPath,
          });
          await chat.waitForWelcomeMessage();
          await chat.sendMessage('hi');
          await chat.waitForDuoResponse();
        },
        TEST_TIMEOUT,
      );

      /**
       * MITM-3: MITM proxy with TLS verification disabled.
       * The "insecure escape hatch" — NODE_TLS_REJECT_UNAUTHORIZED=0.
       * Verifies the CLI can still function when a user disables all TLS
       * validation (documented as insecure, for dev/testing only).
       * Exercises C1+C2+C3 through the MITM proxy without trusting its CA.
       * See docs/ai/cert-proxy.md § "Certificate Configuration Methods".
       */
      it(
        'MITM-3: HTTPS MITM proxy + NODE_TLS_REJECT_UNAUTHORIZED=0',
        async () => {
          interceptor = new NetworkInterceptor();
          await interceptor.startAsMitmProxy();
          chat = launchCliWithNetwork({
            target,
            interceptor,
            useAsProxy: true,
            disableTlsVerification: true,
          });
          await chat.waitForWelcomeMessage();
          await chat.sendMessage('hi');
          await chat.waitForDuoResponse();
        },
        TEST_TIMEOUT,
      );

      /**
       * PRX-2: HTTP CONNECT proxy (no auth) with CA trusted.
       * mockttp terminates TLS, so the CLI still needs the test CA.
       * Functionally similar to MITM-1; kept as a separate scenario to
       * verify the CLI doesn't break when HTTPS_PROXY is set. Only
       * exercises C1 (token check via welcome message).
       * See docs/ai/cert-proxy.md § "Axis 2: Proxy Configuration".
       */
      it(
        'PRX-2: HTTP CONNECT proxy, no auth (via mockttp MITM) + CA trusted',
        async () => {
          interceptor = new NetworkInterceptor();
          await interceptor.startAsMitmProxy();
          chat = launchCliWithNetwork({
            target,
            interceptor,
            useAsProxy: true,
            nodeExtraCaCerts: interceptor.caCertPath,
          });
          await chat.waitForWelcomeMessage();
        },
        TEST_TIMEOUT,
      );
    });

    describe('Group B: negative & regression', () => {
      // TLS error pattern: the CLI surfaces these in the terminal when the
      // MITM proxy's CA is not trusted. The PAT self-check is the first
      // network call and fails immediately, so "User: @..." never appears.
      const TLS_ERROR_PATTERN = /certificate|CERT_|unable to verify|self[- ]signed/i;

      /**
       * MITM-NEG-1: MITM proxy present but no CA configured.
       * Verifies the CLI fails gracefully with a recognizable TLS error
       * (not a crash or silent failure). The token validation is the first
       * network call and should fail immediately.
       * See docs/ai/cert-proxy.md § "Test Gaps" for related negative tests.
       */
      it(
        'MITM-NEG-1: MITM proxy, no CA configured → TLS error in terminal',
        async () => {
          clearCliLogs();
          interceptor = new NetworkInterceptor();
          await interceptor.startAsMitmProxy();
          chat = launchCliWithNetwork({
            target,
            interceptor,
            useAsProxy: true,
            // No nodeExtraCaCerts, no disableTlsVerification.
          });
          await chat.terminal.waitForMatch(TLS_ERROR_PATTERN, 60_000);
          const output = chat.terminal.getFullOutput();
          expect(output).not.toMatch(/uncaught exception/i);
          expect(output).not.toMatch(/User: @\w+/);
        },
        TEST_TIMEOUT,
      );

      /**
       * CA-NEG-2: Wrong CA configured — NODE_EXTRA_CA_CERTS points to a
       * different CA than the one the interceptor uses.
       * Verifies the CLI produces a clean TLS error (not a crash or silent
       * bypass). This catches scenarios where a user has the wrong CA file.
       * See docs/ai/cert-proxy.md § "Axis 1: Certificate Configuration".
       */
      it(
        'CA-NEG-2: wrong CA configured → TLS error in terminal',
        async () => {
          clearCliLogs();
          interceptor = new NetworkInterceptor();
          await interceptor.startAsMitmProxy();
          // Generate an independent CA — no proxy needed, just the cert file.
          const wrongCa = await generateCaCert();
          standaloneCaCerts.push(wrongCa);
          const wrongCaPath = wrongCa.certPath;
          chat = launchCliWithNetwork({
            target,
            interceptor,
            useAsProxy: true,
            nodeExtraCaCerts: wrongCaPath,
          });
          await chat.terminal.waitForMatch(TLS_ERROR_PATTERN, 60_000);
          const output = chat.terminal.getFullOutput();
          expect(output).not.toMatch(/uncaught exception/i);
          expect(output).not.toMatch(/User: @\w+/);
        },
        TEST_TIMEOUT,
      );

      /**
       * REG-006: Regression for lsp!2819 — the archived `get-proxy-settings`
       * library crashes when only HTTP_PROXY is set (without HTTPS_PROXY).
       * The CLI should still start up normally.
       * See docs/ai/cert-proxy.md § "Known Product Bugs".
       */
      it(
        'REG-006: only HTTP_PROXY set (not HTTPS_PROXY) must not crash',
        async () => {
          chat = launchCliWithNetwork({
            target,
            env: { HTTP_PROXY: 'http://127.0.0.1:1' },
          });
          await chat.waitForWelcomeMessage();
          const output = chat.terminal.getFullOutput();
          expect(output).not.toMatch(/uncaught exception/i);
        },
        TEST_TIMEOUT,
      );

      /**
       * REG-004: Regression for vscode-extension#2077 — NODE_EXTRA_CA_CERTS
       * must APPEND to the built-in CA bundle, not replace it.
       * Sets NODE_EXTRA_CA_CERTS to an unrelated test CA, then verifies
       * that connections to public-CA endpoints (gitlab.com, cloud.gitlab.com)
       * still succeed. This is critical because the LS's `gitlab.ca` setting
       * has the opposite bug (replaces all CAs — see docs/ai/cert-proxy.md
       * § "Known Product Bugs").
       * Exercises C1+C2+C3 without a proxy.
       */
      it(
        'REG-004: NODE_EXTRA_CA_CERTS appends to bundled CAs (public-CA AI Gateway still works)',
        async () => {
          // Generate an unrelated CA cert — no proxy needed, just the file.
          const extraCa = await generateCaCert();
          standaloneCaCerts.push(extraCa);
          const extraCaPath = extraCa.certPath;
          chat = launchCliWithNetwork({
            target,
            nodeExtraCaCerts: extraCaPath,
          });
          await chat.waitForWelcomeMessage();
          await chat.sendMessage('hi');
          await chat.waitForDuoResponse();
        },
        TEST_TIMEOUT,
      );
    });
  });
});
