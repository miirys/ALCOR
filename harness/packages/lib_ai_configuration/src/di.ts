import { ServiceCollection } from '@gitlab/needle';
import { registerMcpServices } from './mcp/di';

export function registerAiConfigurationServices(
  serviceCollection: ServiceCollection,
): ServiceCollection {
  registerMcpServices(serviceCollection);

  return serviceCollection;
}
