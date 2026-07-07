import { createInterfaceId, Disposable } from '@gitlab/needle';
import { SandboxConfig, McpServerSandboxOverrides } from './sandbox_config_types';

export interface SandboxConfigService extends Disposable {
  /** Return the sandbox configuration for action handler execution. */
  getEffectiveWorkspaceConfig(workspacePath: string): SandboxConfig;

  /** Return the sandbox configuration for a specific STDIO MCP server. */
  getMcpServerConfig(
    workspacePath: string,
    serverName: string,
    overrides?: McpServerSandboxOverrides,
  ): SandboxConfig;

  /** Recompute cached domains after configuration changes. */
  refresh(): void;
}

export const SandboxConfigService = createInterfaceId<SandboxConfigService>('SandboxConfigService');
