import { Implements, Service, ServiceLifetime } from '@gitlab/needle';
import { EffectiveDecision, McpApprovalPolicy } from './policy';

/**
 * Auto-approve policy used by the CLI in headless mode.
 * Always returns 'approved' without reading or writing the persistent store.
 * This is intentional: headless runs cannot prompt the user, so they must
 * be permissive. Auto-approval does NOT persist to storage.json.
 */
@Implements(McpApprovalPolicy)
@Service({
  dependencies: [],
  lifetime: ServiceLifetime.Singleton,
})
export class AutoApproveApprovalPolicy implements McpApprovalPolicy {
  decide(): EffectiveDecision {
    return 'approved';
  }
}
