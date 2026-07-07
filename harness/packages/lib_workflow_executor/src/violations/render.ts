import type { Logger } from '@gitlab-org/logging';
import type { SandboxViolation } from './types';
import type { SandboxViolations } from './sandbox_violations';

const SANDBOX_BLOCK_MESSAGE = 'Operation is blocked by sandbox.';

export function renderSandboxViolation(): string {
  return SANDBOX_BLOCK_MESSAGE;
}

// Only rewrites when the violation's denied resource is referenced in the error text;
// prevents ambient violations from being attributed to unrelated errors.
export function renderViolation(
  violations: SandboxViolations,
  startMs: number,
  originalError: string,
  logger: Logger,
  command?: string,
): string | undefined {
  let recent: SandboxViolation[];
  try {
    recent = command
      ? violations.getForCommandSince(command, startMs)
      : violations.getSince(startMs);
  } catch (err) {
    logger.debug(`Failed to query sandbox violations: ${err instanceof Error ? err.message : err}`);
    return undefined;
  }
  if (recent.length === 0) return undefined;
  // Walk newest-first; the first violation whose resource is referenced in the error wins.
  // Iterating (instead of taking only the latest) avoids false negatives when an unrelated
  // ambient violation lands slightly later than the one actually caused by this action.
  const sorted = [...recent].sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  for (const violation of sorted) {
    const resource = lastToken(violation.description);
    if (resource && errorReferencesResource(originalError, resource)) {
      logger.debug(
        `Rewriting error as sandbox violation. Violation: "${violation.description}"; Original: "${originalError}"`,
      );
      return SANDBOX_BLOCK_MESSAGE;
    }
  }
  logger.debug(
    `Sandbox violations in window but none referenced by error; skipping rewrite. Violations: ${sorted
      .map((v) => `"${v.description}"`)
      .join(', ')}; Error: "${originalError}"`,
  );
  return undefined;
}

function lastToken(description: string): string | undefined {
  const tokens = description.trim().split(/\s+/);
  const tail = tokens[tokens.length - 1];
  return tail?.replace(/\.+$/, '') || undefined;
}

// Requires a non-path-character boundary after the resource so "/tmp/x" doesn't
// match an unrelated "/tmp/xyz".
function errorReferencesResource(error: string, resource: string): boolean {
  const escaped = resource.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`${escaped}(?:[^/\\w]|$)`).test(error);
}
