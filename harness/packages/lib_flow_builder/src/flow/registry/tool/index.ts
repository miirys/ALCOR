import { ServiceCollection } from '@gitlab/needle';
import { StaticToolProvider } from './static_tool_provider';

export { type ToolDefinition, ToolProvider } from './type';

export function registerDuoToolServices(services: ServiceCollection): ServiceCollection {
  services.addClass(StaticToolProvider);

  return services;
}
