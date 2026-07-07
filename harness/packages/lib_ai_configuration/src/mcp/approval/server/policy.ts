import { createInterfaceId } from '@gitlab/needle';
import { ApprovalEntry } from './types';

export type EffectiveDecision = 'approved' | 'rejected' | 'pendingApproval';

/**
 * McpApprovalPolicy
 *
 * Determines the effective approval decision for a given MCP server config.
 * The default implementation defers to the persisted store entry.
 * The CLI registers AutoApproveApprovalPolicy in headless mode so that
 * non-interactive runs are never blocked by the approval gate.
 */
export interface McpApprovalPolicy {
  decide(configHash: string, persistedEntry: ApprovalEntry | undefined): EffectiveDecision;
}

export const McpApprovalPolicy = createInterfaceId<McpApprovalPolicy>('McpApprovalPolicy');
