import { ServiceCollection, ServiceLifetime, createFactoryDescriptor } from '@gitlab/needle';
import { DefaultMcpAuthFlowManager, McpAuthFlowManager } from './services/flow_manager';
import { McpAuthFinalizerRegistry, McpAuthFlowController } from './types';

export function registerMcpAuthFlowServices(serviceCollection: ServiceCollection) {
  serviceCollection.addClass(DefaultMcpAuthFlowManager);

  serviceCollection.add(
    createFactoryDescriptor({
      aliases: [McpAuthFinalizerRegistry],
      lifetime: ServiceLifetime.Singleton,
      factory: (ctx) => {
        return ctx.getRequiredService(McpAuthFlowManager);
      },
    }),
  );

  serviceCollection.add(
    createFactoryDescriptor({
      aliases: [McpAuthFlowController],
      lifetime: ServiceLifetime.Singleton,
      factory: (ctx) => {
        return ctx.getRequiredService(McpAuthFlowManager);
      },
    }),
  );
}
