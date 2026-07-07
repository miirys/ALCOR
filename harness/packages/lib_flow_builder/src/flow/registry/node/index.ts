import { ServiceCollection } from '@gitlab/needle';
import { StaticNodeTypeDefinitionProvider } from './static_node_type_definition_provider';

export * from './types';
export * from './schemas';

export function registerNodeServices(serviceCollection: ServiceCollection): ServiceCollection {
  serviceCollection.addClass(StaticNodeTypeDefinitionProvider);

  return serviceCollection;
}
