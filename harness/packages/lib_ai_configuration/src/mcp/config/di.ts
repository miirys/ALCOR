import { ServiceCollection } from '@gitlab/needle';
import { DefaultMcpConfigResolver } from './default_resolver';
import { DefaultMcpConfigWriter } from './writer';

export function registerMcpConfigService(serviceCollection: ServiceCollection) {
  serviceCollection.addClass(DefaultMcpConfigResolver);
  serviceCollection.addClass(DefaultMcpConfigWriter);
}
