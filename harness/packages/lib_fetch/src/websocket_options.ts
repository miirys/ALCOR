import type { WebSocketConnectionOptions } from './fetch';

/**
 * Returns true when running under the Bun runtime.
 *
 * Local copy to avoid a circular dependency between `@gitlab-org/fetch`
 * and `@gitlab-org/core`. The canonical implementation lives in
 * `@gitlab-org/core` (`isBunRuntime`).
 */
function isBunRuntime(): boolean {
  return typeof process.versions.bun === 'string';
}

/**
 * Translates structured WebSocket options to the flat option shape that
 * `isomorphic-ws` / `ws` accepts.
 *
 * Under Node.js this returns `{ agent, ca, cert, key, rejectUnauthorized }`.
 * Under Bun the shape differs — see `toBunWsOptions` for the rationale.
 *
 * NOTE: Bun-specific behaviour is pinned to Bun 1.3.10 (`mise/config.toml`).
 * On a Bun upgrade, re-validate `toBunWsOptions` against the cert/proxy e2e
 * suite (`packages/cli/test/e2e/network/`, CI job `cli-network-e2e`).
 */
export function toIsomorphicWsOptions(
  options: WebSocketConnectionOptions,
): Record<string, unknown> {
  if (isBunRuntime()) {
    return toBunWsOptions(options);
  }
  return toNodeWsOptions(options);
}

/**
 * Returns human-readable warning strings for any caller-supplied
 * `WebSocketConnectionOptions` fields that `toIsomorphicWsOptions` will
 * silently drop under the current runtime.
 *
 * Today this is only relevant on Bun, where we deliberately do not pass
 * `tls.ca` / `tls.cert` / `tls.key` (see `toBunWsOptions`). Customers who
 * configure those values via `httpAgentOptions` would otherwise have no
 * indication that their settings were ignored.
 *
 * Returns an empty array under Node.js (everything is honoured).
 */
export function getDroppedOptionsWarnings(options: WebSocketConnectionOptions): string[] {
  if (!isBunRuntime()) {
    return [];
  }
  const warnings: string[] = [];

  if (options.proxyUrl && !isHttpProxy(options.proxyUrl) && !options.agent) {
    warnings.push(
      "HTTPS proxy is being used without a Node agent on Bun WebSocket — Bun's 'proxy' option does not reliably tunnel through TLS-terminating (MITM) proxies and the connection may drop.",
    );
  }

  if (!options.tls) {
    return warnings;
  }
  if (options.tls.ca !== undefined) {
    warnings.push(
      "Custom 'ca' (TLS certificate authority) is ignored on Bun WebSocket — set NODE_EXTRA_CA_CERTS env var instead.",
    );
  }
  if (options.tls.cert !== undefined || options.tls.key !== undefined) {
    warnings.push(
      "Custom client 'cert' / 'key' (mutual TLS) is not supported on Bun WebSocket — connection will proceed without client cert.",
    );
  }
  return warnings;
}

function toNodeWsOptions(options: WebSocketConnectionOptions): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  if (options.agent) {
    result.agent = options.agent;
  }

  if (options.tls) {
    const { ca, cert, key, rejectUnauthorized } = options.tls;
    if (ca !== undefined) result.ca = ca;
    if (cert !== undefined) result.cert = cert;
    if (key !== undefined) result.key = key;
    if (rejectUnauthorized !== undefined) result.rejectUnauthorized = rejectUnauthorized;
  }

  return result;
}

function isHttpProxy(proxyUrl: string): boolean {
  return proxyUrl.startsWith('http://');
}

function toBunWsOptions(options: WebSocketConnectionOptions): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  // Under Bun, neither `agent` nor `proxy:` is a universal answer for
  // WebSocket proxying. Empirically (Bun 1.3.10):
  //
  // - `proxy: 'http://...'`  — works (e.g. SRT sandbox CONNECT proxy at
  //   `http://localhost:3128`, issue #2445). Required for `ws://` targets,
  //   where Bun silently ignores `agent`.
  // - `proxy: 'https://...'` — fails for HTTPS MITM proxies (e.g. corporate
  //   SSL-inspection firewalls): the WebSocket opens but drops with code
  //   1006 within ~30s. Bun's `proxy:` option doesn't properly tunnel
  //   keepalive through a TLS-terminated proxy.
  // - `agent: ProxyAgent`    — honoured by Bun's WebSocket via its
  //   Node-compatibility layer, but only for `wss://` targets. Works for
  //   HTTPS MITM proxies because TLS trust + CONNECT tunnelling are
  //   managed by the Node `ProxyAgent`.
  //
  // We pick based on the proxy scheme: HTTP proxies use Bun's documented
  // `proxy:` (the SRT case); HTTPS proxies use the Node `agent` fallback
  // (the corporate-MITM case). Passing both has been observed to confuse
  // Bun's transport (TLS handshake failures on retry).
  if (options.proxyUrl && isHttpProxy(options.proxyUrl)) {
    result.proxy = options.proxyUrl;
  } else if (options.agent) {
    result.agent = options.agent;
  } else if (options.proxyUrl) {
    // HTTPS proxy supplied but no agent available — best-effort fallback.
    // In practice `Fetch.getWebSocketOptions()` always populates `agent`
    // alongside `proxyUrl`, so this branch is rarely hit; included so the
    // translator degrades gracefully for direct callers.
    result.proxy = options.proxyUrl;
  }

  // We deliberately do NOT pass `tls.ca` / `tls.cert` / `tls.key` under
  // Bun. Bun's WebSocket honours `NODE_EXTRA_CA_CERTS` via its default
  // trust store; passing an explicit `tls` object suppresses that. Use
  // `getDroppedOptionsWarnings` to surface a warning to callers who
  // configured a CA that we're ignoring here.
  //
  // The only `tls` option we DO honour is an explicit
  // `rejectUnauthorized: false` (insecure escape hatch); passing
  // `rejectUnauthorized: true` would also suppress env-var trust handling.
  if (options.tls?.rejectUnauthorized === false) {
    result.tls = { rejectUnauthorized: false };
  }

  return result;
}
