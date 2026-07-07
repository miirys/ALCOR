import { Implements, Service, ServiceLifetime } from '@gitlab/needle';
import { ApprovalEntry } from './types';
import { EffectiveDecision, McpApprovalPolicy } from './policy';

/**
 * Default policy used by IDEs: returns the persisted decision, or
 * 'pendingApproval' if no entry exists.
 */
@Implements(McpApprovalPolicy)
@Service({
  dependencies: [],
  lifetime: ServiceLifetime.Singleton,
})
export class DefaultApprovalPolicy implements McpApprovalPolicy {
  decide(_configHash: string, persistedEntry: ApprovalEntry | undefined): EffectiveDecision {
    if (!persistedEntry) return 'pendingApproval';
    return persistedEntry.decision;
  }
}
