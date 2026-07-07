import { Implements, Service, ServiceLifetime } from '@gitlab/needle';
import { NodeTypeDefinition, NodeTypeDefinitionProvider } from './types';
import { NODE_DEFINITIONS } from './nodes';

@Service({
  dependencies: [],
  lifetime: ServiceLifetime.Singleton,
})
@Implements(NodeTypeDefinitionProvider)
export class StaticNodeTypeDefinitionProvider implements NodeTypeDefinitionProvider {
  getNodeTypeDefinitions(): NodeTypeDefinition[] {
    return NODE_DEFINITIONS;
  }
}
