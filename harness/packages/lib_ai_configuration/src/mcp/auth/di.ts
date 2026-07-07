import { ServiceCollection } from '@gitlab/needle';
import { registerAuthStorageServices } from './storage';
import { registerMcpAuthFlowServices } from './flow';
import { registerMcpAuthCallbackServices } from './callback';
import { registerMcpAuthProviderServices } from './provider';

export function registerMcpAuthServices(serviceCollection: ServiceCollection) {
  registerAuthStorageServices(serviceCollection);
  registerMcpAuthFlowServices(serviceCollection);
  registerMcpAuthCallbackServices(serviceCollection);
  registerMcpAuthProviderServices(serviceCollection);
}
