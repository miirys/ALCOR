import { Implements, Service, ServiceLifetime } from '@gitlab/needle';
import { RuntimeProvidedVariableProvider, type RuntimeProvidedVariableDefinition } from './types';
import { RUNTIME_PROVIDED_VARIABLE_DEFINITIONS } from './variables';

@Service({
  dependencies: [],
  lifetime: ServiceLifetime.Singleton,
})
@Implements(RuntimeProvidedVariableProvider)
export class StaticRuntimeProvidedVariableProvider implements RuntimeProvidedVariableProvider {
  getAll(): RuntimeProvidedVariableDefinition[] {
    return RUNTIME_PROVIDED_VARIABLE_DEFINITIONS;
  }
}
