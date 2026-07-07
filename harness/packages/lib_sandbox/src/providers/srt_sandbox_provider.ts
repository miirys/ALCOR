import { Injectable } from '@gitlab/needle';
import { SandboxManager, type SandboxRuntimeConfig } from '@anthropic-ai/sandbox-runtime';
import type { AnthropicSRTConfig, SandboxConfig } from '../sandbox_config_types';
import { shellQuote } from '../shell_quote';
import { SandboxProvider, type SandboxedCommand } from './sandbox_provider';

/**
 * Anthropic Sandbox Runtime provider. Bundled SDK-backed implementation: keeps
 * the runtime in the binary and wraps the worker command via the SDK. Stateless;
 * `SandboxManager.initialize()` is process-global (first-call-wins), so the
 * provider holds no resource to dispose.
 */
@Injectable(SandboxProvider, [])
export class SrtSandboxProvider implements SandboxProvider {
  readonly id = 'anthropic-sandbox-runtime';

  async wrapCommand(
    command: string,
    args: string[],
    policy: SandboxConfig,
  ): Promise<SandboxedCommand> {
    // Guard the discriminant before reading SRT-specific fields; the interface accepts the base type.
    if ((policy.provider as string) !== 'anthropic-sandbox-runtime') {
      throw new Error(
        `SrtSandboxProvider received an unsupported policy provider '${policy.provider}'; expected 'anthropic-sandbox-runtime'.`,
      );
    }
    const config = policy as AnthropicSRTConfig;
    const runtimeConfig: SandboxRuntimeConfig = {
      network: {
        allowedDomains: config.network.allowedDomains,
        deniedDomains: config.network.deniedDomains ?? [],
      },
      filesystem: {
        allowRead: config.filesystem.allowRead ?? [],
        denyRead: config.filesystem.denyRead,
        allowWrite: config.filesystem.allowWrite,
        denyWrite: config.filesystem.denyWrite,
      },
      ignoreViolations: config.ignoreViolations,
      enableWeakerNestedSandbox: config.enableWeakerNestedSandbox,
    };

    // Third arg enables macOS log monitor; initialize() is first-call-wins across the process.
    await SandboxManager.initialize(runtimeConfig, undefined, true);
    const sandboxedCmd = [command, ...args].map(shellQuote).join(' ');
    const wrappedCmd = await SandboxManager.wrapWithSandbox(sandboxedCmd, undefined, runtimeConfig);
    return { kind: 'shell', command: wrappedCmd };
  }
}
