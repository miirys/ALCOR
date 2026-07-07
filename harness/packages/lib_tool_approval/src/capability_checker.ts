import type { Logger } from '@gitlab-org/logging';

const TOOL_APPROVAL_CAPABILITY = 'tool_call_approval';
const TOOL_PATTERN_APPROVAL_CAPABILITY = 'tool_call_pattern_approval';

export interface CapabilityCheckOptions {
  logger: Logger;
  /**
   * Gateway capabilities for this workflow, from WorkflowRunner.getServerCapabilities().
   * Contains capabilities negotiated during the direct_access flow.
   */
  capabilities: string[] | null;
}

/**
 * Checks if tool call approvals (session-scoped approvals) are supported.
 *
 * Checks if the Gateway advertises the 'tool_call_approval' capability, which indicates
 * support for session-scoped tool approvals via GraphQL mutations.
 *
 * If the capability is not present, the function returns false and users will only
 * see "Approve once" option. MCP tools may still use local controller fallback.
 *
 * The capabilities are retrieved from WorkflowRunner.getServerCapabilities(),
 * which returns capabilities negotiated during the direct_access flow.
 *
 * @param options - Capability check options including workflow capabilities
 * @returns true if Gateway supports tool call approvals, false otherwise
 */
export function supportsToolCallApprovals(options: CapabilityCheckOptions): boolean {
  const { logger, capabilities } = options;

  // Check Gateway capabilities
  if (!capabilities) {
    // Capabilities should have been negotiated via direct_access before workflow started.
    // If missing, be conservative and don't show session approval option.
    logger.warn(
      `Server capabilities not available. This may indicate an issue with direct_access flow. Defaulting to no session approval support.`,
    );
    return false;
  }

  const gatewaySupports = capabilities.includes(TOOL_APPROVAL_CAPABILITY);

  if (!gatewaySupports) {
    logger.warn(
      `Tool approval persistence unavailable: Gateway doesn't have '${TOOL_APPROVAL_CAPABILITY}' capability. This may indicate Gateway version mismatch or feature flag disabled.`,
    );
    return false;
  }

  logger.debug(`Tool approval persistence available`);
  return true;
}

/**
 * Checks if pattern-based tool call approvals are supported.
 * Pattern approvals are an extension of session approvals — both are gated on the same backend setting.
 */
export function supportsPatternApprovals(options: CapabilityCheckOptions): boolean {
  const { logger, capabilities } = options;

  if (!capabilities) {
    logger.warn(
      `Server capabilities not available. This may indicate an issue with direct_access flow. Defaulting to no pattern approval support.`,
    );
    return false;
  }

  const gatewaySupports = capabilities.includes(TOOL_PATTERN_APPROVAL_CAPABILITY);

  if (!gatewaySupports) {
    logger.debug(
      `Pattern approval unavailable: Gateway doesn't have '${TOOL_PATTERN_APPROVAL_CAPABILITY}' capability.`,
    );
    return false;
  }

  logger.debug(`Pattern approval available`);
  return true;
}
