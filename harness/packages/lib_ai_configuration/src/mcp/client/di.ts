import { ServiceCollection } from '@gitlab/needle';
import { McpConnectionFactory } from './connection_factory';
import { TransportFactory } from './transport/transport_factory';

export function registerMcpClientServices(serviceCollection: ServiceCollection) {
  serviceCollection.addClass(TransportFactory);
  serviceCollection.addClass(McpConnectionFactory);

  return serviceCollection;
}
