import { ServiceCollection } from '@gitlab/needle';
import { StaticRuntimeProvidedVariableProvider } from './static_runtime_provided_variable_provider';

export type { RuntimeProvidedVariableDefinition } from './types';
export { RuntimeProvidedVariableProvider } from './types';
export { RUNTIME_PROVIDED_VARIABLE_DEFINITIONS } from './variables';

export function registerContextServices(services: ServiceCollection): ServiceCollection {
  services.addClass(StaticRuntimeProvidedVariableProvider);
  return services;
}
