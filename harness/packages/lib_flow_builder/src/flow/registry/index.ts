import { ServiceCollection } from '@gitlab/needle';
import { registerDuoToolServices } from './tool';
import { registerNodeServices } from './node';
import { registerContextServices } from './context';

export { type NodeTypeDefinition, NodeTypeDefinitionProvider } from './node';
export { type ToolDefinition, ToolProvider } from './tool';
export {
  type RuntimeProvidedVariableDefinition,
  RuntimeProvidedVariableProvider,
  RUNTIME_PROVIDED_VARIABLE_DEFINITIONS,
} from './context';

export function registerFlowRegistyServices(services: ServiceCollection): ServiceCollection {
  registerDuoToolServices(services);
  registerNodeServices(services);
  registerContextServices(services);

  return services;
}
