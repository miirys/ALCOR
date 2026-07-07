import {
  AGENT_PRIVILEGES,
  HEADLESS_CLI_PRE_APPROVED_AGENT_PRIVILEGES,
  PLAN_AGENT_PRIVILEGES,
  WorkflowRunner,
} from '@gitlab-lsp/workflow-api';
import type { AgentMode } from '../backend';

export type PrivilegeSyncResult =
  | { type: 'unchanged' }
  | { type: 'applied' }
  | { type: 'error'; message: string };

/**
 * The caller (GitLabBackend) owns the workflow id and how to react to a failed
 * reconcile (warn vs abort the turn); this class is the mechanism and never
 * touches conversation/UX.
 */
export class WorkflowAgentPrivileges {
  #runner: Pick<WorkflowRunner, 'updateAgentPrivileges'>;

  // When false (a normal interactive session) the pre-approved set stays empty
  // so each tool still requires user approval.
  #preApprove: boolean;

  // 'unknown' on resume: the resumed workflow's privileges may have been set by a
  // different client, so the first reconcile always applies them.
  #appliedMode: 'build' | 'plan' | 'unknown' = 'unknown';

  constructor(runner: Pick<WorkflowRunner, 'updateAgentPrivileges'>, preApprove: boolean) {
    this.#runner = runner;
    this.#preApprove = preApprove;
  }

  privilegesForMode(mode: AgentMode | undefined): AGENT_PRIVILEGES[] {
    return mode === 'plan' ? PLAN_AGENT_PRIVILEGES : HEADLESS_CLI_PRE_APPROVED_AGENT_PRIVILEGES;
  }

  // Creation already applied the mode's privileges, so record the baseline to
  // keep the first reconcile a no-op.
  markCreated(mode: AgentMode | undefined): void {
    this.#appliedMode = this.#normalize(mode);
  }

  // On instances older than the mutation's supported version this is a graceful
  // no-op (the operation's fallback reports no errors).
  async reconcile(workflowId: string, mode: AgentMode | undefined): Promise<PrivilegeSyncResult> {
    const normalized = this.#normalize(mode);
    if (normalized === this.#appliedMode) return { type: 'unchanged' };

    const privileges = this.privilegesForMode(mode);
    const preApproved = this.#preApprove ? privileges : [];
    try {
      const errors = await this.#runner.updateAgentPrivileges(workflowId, privileges, preApproved);
      if (errors.length > 0) return { type: 'error', message: errors.join('; ') };
    } catch (err) {
      return { type: 'error', message: err instanceof Error ? err.message : 'Unknown error' };
    }
    this.#appliedMode = normalized;
    return { type: 'applied' };
  }

  #normalize(mode: AgentMode | undefined): 'build' | 'plan' {
    return mode === 'plan' ? 'plan' : 'build';
  }
}
