import { Injectable } from '@gitlab/needle';
import { SandboxManager, type SandboxViolationEvent } from '@anthropic-ai/sandbox-runtime';
import { SandboxViolations, type SandboxViolation } from '@gitlab-org/workflow-executor/violations';

function mapAndFilter(events: SandboxViolationEvent[], startMs: number): SandboxViolation[] {
  return events
    .filter((v) => v.timestamp.getTime() >= startMs)
    .map((v) => ({ description: v.line, timestamp: v.timestamp }));
}

@Injectable(SandboxViolations, [])
export class DesktopSandboxViolations implements SandboxViolations {
  getSince(startMs: number): SandboxViolation[] {
    return mapAndFilter(SandboxManager.getSandboxViolationStore().getViolations(), startMs);
  }

  getForCommandSince(command: string, startMs: number): SandboxViolation[] {
    return mapAndFilter(
      SandboxManager.getSandboxViolationStore().getViolationsForCommand(command),
      startMs,
    );
  }
}
