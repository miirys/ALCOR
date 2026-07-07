import { createInterfaceId } from '@gitlab/needle';
import type { SandboxConfig } from '../sandbox_config_types';

/**
 * How to spawn a sandboxed command. `shell` carries a single wrapped
 * command string spawned through a shell; `argv` carries a binary plus args
 * spawned directly. Discriminated so quoting and spawn semantics are
 * type-scoped to the variant that needs them.
 */
export type SandboxedCommand =
  | { kind: 'shell'; command: string }
  | { kind: 'argv'; command: string; args: string[] };

/**
 * Translates an agnostic sandbox policy into a sandboxed command for one
 * provider. The caller computes the policy and spawns the returned invocation;
 * the provider owns only the translation.
 */
export interface SandboxProvider {
  readonly id: string;
  wrapCommand(command: string, args: string[], policy: SandboxConfig): Promise<SandboxedCommand>;
}

export const SandboxProvider = createInterfaceId<SandboxProvider>('SandboxProvider');
