import { createInterfaceId } from '@gitlab/needle';

export type ApprovalDecision = 'approved' | 'rejected';

export interface ApprovalEntry {
  decision: ApprovalDecision;
}

export interface McpServerApprovalStore {
  /**
   * Look up the persisted approval entry for a given config hash.
   * Returns undefined if no decision has been recorded.
   */
  lookup(configHash: string): Promise<ApprovalEntry | undefined>;

  /**
   * Record an "approved" decision for the given config hash.
   */
  approve(configHash: string): Promise<void>;

  /**
   * Record a "rejected" decision for the given config hash.
   */
  reject(configHash: string): Promise<void>;

  /**
   * Remove the persisted entry so the user will be re-prompted.
   */
  revoke(configHash: string): Promise<void>;

  /**
   * List all persisted entries (for UI / future "Approvals" pane).
   */
  list(): Promise<({ hash: string } & ApprovalEntry)[]>;
}

export const McpServerApprovalStore =
  createInterfaceId<McpServerApprovalStore>('McpServerApprovalStore');
