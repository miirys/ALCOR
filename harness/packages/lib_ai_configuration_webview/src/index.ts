import { ServiceCollection } from '@gitlab/needle';
import { McpDashboardService } from './services/mcp_dashboard_service';

export function registerAIConfigurationWebviewServices(
  services: ServiceCollection,
): ServiceCollection {
  services.addClass(McpDashboardService);

  return services;
}
