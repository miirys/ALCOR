import { Injectable } from '@gitlab/needle';
import { Logger, withPrefix } from '@gitlab-org/logging';
import { ConfigService } from '@gitlab-org/config';
import { SandboxManager, type SandboxRuntimeConfig } from '@anthropic-ai/sandbox-runtime';
import { McpStdioCommandTransformer, type StdioLaunchParams } from '@gitlab-org/ai-configuration';
import { SandboxUnavailableError } from './errors';
import { SandboxAvailabilityService } from './sandbox_availability_service';
import { SandboxConfigService } from './sandbox_config_service';
import type { SandboxConfig, McpServerSandboxOverrides } from './sandbox_config_types';
import { shellQuote } from './shell_quote';

@Injectable(McpStdioCommandTransformer, [
  SandboxAvailabilityService,
  SandboxConfigService,
  ConfigService,
  Logger,
])
export class DesktopMcpStdioSandboxWrapper
  implements McpStdioCommandTransformer<McpServerSandboxOverrides>
{
  #sandboxAvailability: SandboxAvailabilityService;

  #sandboxConfig: SandboxConfigService;

  #configService: ConfigService;

  #logger: Logger;

  constructor(
    sandboxAvailability: SandboxAvailabilityService,
    sandboxConfig: SandboxConfigService,
    configService: ConfigService,
    logger: Logger,
  ) {
    this.#sandboxAvailability = sandboxAvailability;
    this.#sandboxConfig = sandboxConfig;
    this.#configService = configService;
    this.#logger = withPrefix(logger, '[McpSandboxWrapper]');
  }

  async transform(
    serverName: string,
    params: StdioLaunchParams,
    workspacePath: string,
    overrides?: McpServerSandboxOverrides,
  ): Promise<StdioLaunchParams> {
    const globalEnabled = this.#configService.get('duo.sandbox.enabled') ?? false;
    if (!globalEnabled) {
      return params;
    }

    if (overrides?.sandboxEnabled === false) {
      this.#logger.debug(`Sandbox disabled for server "${serverName}" via config`);
      return params;
    }

    const status = this.#sandboxAvailability.getStatus();
    if (!status.available) {
      throw new SandboxUnavailableError(
        `Sandbox is enabled but sandbox provider is not available (${status.reason}). ` +
          `Either install provider dependencies or disable sandboxing for server "${serverName}" ` +
          `with "sandbox": { "sandboxEnabled": false }.`,
        status.reason,
      );
    }

    const sandboxConfig = this.#sandboxConfig.getMcpServerConfig(
      workspacePath,
      serverName,
      overrides,
    );
    const providerConfig = toProviderRuntimeConfig(sandboxConfig);

    // Third arg enables macOS log monitor; first-call-wins across the process.
    await SandboxManager.initialize(providerConfig, undefined, true);

    const originalCmd = [params.command, ...params.args].map(shellQuote).join(' ');
    const wrappedCmd = await SandboxManager.wrapWithSandbox(originalCmd, undefined, providerConfig);

    this.#logger.info(`Wrapping MCP server "${serverName}"`);

    return {
      command: '/bin/sh',
      args: ['-c', wrappedCmd],
      env: params.env,
    };
  }
}

function toProviderRuntimeConfig(config: SandboxConfig): SandboxRuntimeConfig {
  return {
    network: {
      allowedDomains: config.network.allowedDomains,
      deniedDomains: config.network.deniedDomains ?? [],
    },
    filesystem: {
      allowRead: config.filesystem.allowRead,
      denyRead: config.filesystem.denyRead,
      allowWrite: config.filesystem.allowWrite,
      denyWrite: config.filesystem.denyWrite,
    },
  };
}
