import os from 'node:os';
import { getLanguageServerVersion } from '@gitlab-org/core';
import {
  type EnvInfo,
  type DuoCliDistribution,
  DUO_CLI_DISTRIBUTIONS,
  detectTerminal,
  detectShell,
  isKittyProtocolSupported,
  detectTerminalTheme,
} from '@gitlab-org/tui';

const getEnvironment = (): EnvironmentLabel => {
  // @ts-ignore
  return BUNDLER_INJECTED_ENVIRONMENT;
};

export const getDistribution = (): DuoCliDistribution => {
  // GITLAB_DUO_DISTRIBUTION env var takes precedence (set by glab when invoking duo-cli)
  const envValue = process.env.GITLAB_DUO_DISTRIBUTION;
  if (envValue) {
    if ((DUO_CLI_DISTRIBUTIONS as readonly string[]).includes(envValue)) {
      return envValue as DuoCliDistribution;
    }
    // eslint-disable-next-line no-console
    console.warn(`Unknown GITLAB_DUO_DISTRIBUTION value "${envValue}", falling back to "unknown"`);
    return 'unknown';
  }

  // @ts-ignore
  return BUNDLER_INJECTED_DISTRIBUTION;
};

export type EnvironmentLabel = 'development' | 'production';

let envInfo: EnvInfo | undefined;

/** Static environment facts that never depend on probing the terminal. */
type TerminalCapabilities = Pick<EnvInfo, 'isKittyProtocolSupported' | 'theme'>;

const buildEnvInfo = (capabilities: TerminalCapabilities): EnvInfo => ({
  terminalName: detectTerminal(),
  isKittyProtocolSupported: capabilities.isKittyProtocolSupported,
  theme: capabilities.theme,
  duoCliVersion: getLanguageServerVersion(),
  environment: getEnvironment(),
  distribution: getDistribution(),
  osPlatform: os.type(),
  osVersion: os.release(),
  shell: detectShell(),
});

/**
 * Environment info for interactive commands (TUI, config editor) that render a
 * live terminal UI. Probes the terminal for kitty-protocol support and theme.
 * These probes WRITE query escape sequences to the terminal, which is safe for
 * an interactive surface but would corrupt machine-readable output (see
 * {@link getHeadlessEnvInfo}).
 */
export const getInteractiveEnvInfo = async (): Promise<EnvInfo> => {
  if (!envInfo) {
    envInfo = buildEnvInfo({
      isKittyProtocolSupported: await isKittyProtocolSupported(),
      theme: await detectTerminalTheme(),
    });
  }

  return envInfo;
};

/**
 * Environment info for headless commands (e.g. `run`) that never render a live
 * terminal UI. Skips the terminal-capability probes and uses safe defaults:
 * the probes emit query escape sequences when stdin/stdout is a TTY (e.g. under
 * a PTY allocated by `glab duo cli`), which would corrupt the command's output
 * stream.
 */
export const getHeadlessEnvInfo = async (): Promise<EnvInfo> => {
  if (!envInfo) {
    envInfo = buildEnvInfo({ isKittyProtocolSupported: false, theme: 'dark' });
  }

  return envInfo;
};
