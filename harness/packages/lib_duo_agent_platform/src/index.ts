import { ServiceCollection } from '@gitlab/needle';
import { CreditLedgerFactory } from '@gitlab-org/credit-ledger';
import { WorkflowManager } from './workflow_manager';
import { DuoAgentPlatformService } from './duo_agent_platform_service';

export { WorkflowManager } from './workflow_manager';

export function registerDuoAgentPlatformServices(services: ServiceCollection): ServiceCollection {
  // Registered here so the credit ledger is co-located wherever the agent
  // platform service runs (it depends on it for per-turn attribution).
  services.addClass(CreditLedgerFactory);
  services.addClass(WorkflowManager);
  services.addClass(DuoAgentPlatformService);
  return services;
}
