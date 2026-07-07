import { Implements, Service, ServiceLifetime } from '@gitlab/needle';
import { ToolDefinition, ToolProvider } from './type';
import { TOOL_DEFINITIONS } from './tools';

@Service({
  dependencies: [],
  lifetime: ServiceLifetime.Singleton,
})
@Implements(ToolProvider)
export class StaticToolProvider implements ToolProvider {
  get(name: string): ToolDefinition | undefined {
    return TOOL_DEFINITIONS.find((x) => x.name === name);
  }

  getAll(): ToolDefinition[] {
    return TOOL_DEFINITIONS;
  }
}
