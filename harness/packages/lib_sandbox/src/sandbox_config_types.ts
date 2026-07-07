/** Base provider-agnostic sandbox configuration for sandboxed process execution. */
export interface SandboxConfig {
  provider: 'anthropic-sandbox-runtime';
  filesystem: {
    allowRead?: string[];
    denyRead: string[];
    allowWrite: string[];
    denyWrite: string[];
  };
  network: {
    allowedDomains: string[];
    deniedDomains?: string[];
  };
}

/**
 * Anthropic Sandbox Runtime (srt) configuration.
 * @see https://github.com/anthropic-experimental/sandbox-runtime?tab=readme-ov-file#configuration-options
 */
export interface AnthropicSRTConfig extends SandboxConfig {
  provider: 'anthropic-sandbox-runtime';
  /** Weaker sandbox for Docker/container environments. */
  enableWeakerNestedSandbox?: boolean;
  /** Allow access to com.apple.trustd.agent (macOS field to allow certificate verification in Golang applications). */
  enableWeakerNetworkIsolation?: boolean;
  /** Suppress violation reports for known-noisy paths. */
  ignoreViolations?: Record<string, string[]>;
}

/**
 * Per-MCP-server sandbox overrides from the `sandbox` key in a STDIO server config.
 * Field names align with {@link SandboxConfig} for settings precedence resolution.
 */
export interface McpServerSandboxOverrides {
  allowedDomains?: string[];
  allowRead?: string[];
  allowWrite?: string[];
  denyRead?: string[];
  /** Consumed by the MCP manager layer, not by SandboxConfigService. */
  sandboxEnabled?: boolean;
}
