import { createInterfaceId } from '@gitlab/needle';
import type { SandboxViolation } from './types';

export interface SandboxViolations {
  getSince(startMs: number): SandboxViolation[];
  // `command` must be the original unwrapped string; the provider matches by encoded-command marker.
  getForCommandSince(command: string, startMs: number): SandboxViolation[];
}

export const SandboxViolations = createInterfaceId<SandboxViolations>('SandboxViolations');
