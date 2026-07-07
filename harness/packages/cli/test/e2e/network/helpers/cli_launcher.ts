import { resolve } from 'node:path';
import { ChatPage, type ChatPageLaunchOptions } from '../../pages/chat_page';
import type { CliTestOptions } from '../../pages/cli_test_options';
import { createTestEnv, getTestToken } from '../../test_utils';
import { deriveCastPath } from '../../recorded_test';
import type { NetworkInterceptor } from './interceptor';

export type CliTarget = 'node-bundle' | 'binary';

export interface NetworkLaunchOptions {
  /** Interceptor to route traffic through. Sets HTTPS_PROXY when provided. */
  interceptor?: NetworkInterceptor;
  /** Whether to send HTTPS_PROXY env var when interceptor is provided. */
  useAsProxy?: boolean;
  /** Path to a PEM CA file. Sets NODE_EXTRA_CA_CERTS. */
  nodeExtraCaCerts?: string;
  /** Sets NODE_TLS_REJECT_UNAUTHORIZED=0. */
  disableTlsVerification?: boolean;
  /** NODE_OPTIONS (e.g. '--use-system-ca'). Applies to node bundle only. */
  nodeOptions?: string;
  /** Additional env overrides. */
  env?: Record<string, string>;
  /** GitLab base URL override (e.g. mockttp URL when testing as TLS terminator). */
  gitlabBaseUrl?: string;
  /** Which CLI target to launch. Defaults to 'node-bundle'. */
  target?: CliTarget;
  /** Extra CLI options. */
  cliOptions?: CliTestOptions;
  /** Omit the gitlab auth token. Useful for negative-config scenarios. */
  omitAuthToken?: boolean;
  cols?: number;
  rows?: number;
  /** Path to the .cast recording file. Auto-derived from test name when omitted. */
  castFile?: string;
}

/** Launch the Duo CLI with the given network environment overrides. */
export function launchCliWithNetwork(opts: NetworkLaunchOptions = {}): ChatPage {
  const envOverrides: Record<string, string> = { ...(opts.env ?? {}) };

  if (opts.interceptor && opts.useAsProxy) {
    // Set both HTTP_PROXY and HTTPS_PROXY. The LS's `get-proxy-settings`
    // dependency throws when only one is set (it passes null to
    // `new ProxySetting()`), causing the proxy to be silently bypassed.
    // This is a known product bug — see network/README.md.
    envOverrides.HTTPS_PROXY = opts.interceptor.proxyUrl;
    envOverrides.HTTP_PROXY = opts.interceptor.proxyUrl;
  }
  if (opts.nodeExtraCaCerts) {
    envOverrides.NODE_EXTRA_CA_CERTS = opts.nodeExtraCaCerts;
  }
  if (opts.disableTlsVerification) {
    envOverrides.NODE_TLS_REJECT_UNAUTHORIZED = '0';
  }
  if (opts.nodeOptions) {
    envOverrides.NODE_OPTIONS = opts.nodeOptions;
  }

  const cliOptions: CliTestOptions = {
    ...(opts.omitAuthToken ? {} : { gitlabAuthToken: getTestToken() }),
    ...(opts.gitlabBaseUrl ? { gitlabBaseUrl: opts.gitlabBaseUrl } : {}),
    ...(opts.cliOptions ?? {}),
  };

  const target = opts.target ?? 'node-bundle';
  const castFile = opts.castFile ?? deriveCastPath(`network-${target}-${Date.now()}`);
  const launchOpts: ChatPageLaunchOptions = {
    cliOptions,
    env: createTestEnv(envOverrides),
    cols: opts.cols,
    rows: opts.rows,
    castFile,
  };

  if (target === 'node-bundle') {
    launchOpts.executable = 'node';
    launchOpts.prependArgs = [resolve(process.cwd(), 'dist/index.js')];
  }
  // else: default (binary) — ChatPage.launch already uses getCompiledBinaryPath()

  return ChatPage.launch(launchOpts);
}

// Re-export for backward compatibility with network tests
export { getCompiledBinaryPath } from '../../test_utils';
