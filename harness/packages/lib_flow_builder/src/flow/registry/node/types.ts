import { createInterfaceId } from '@gitlab/needle';
import type { NodeTypeDefinition } from '../../types';

export type { NodeTypeDefinition } from '../../types';
export interface NodeTypeDefinitionProvider {
  getNodeTypeDefinitions(): NodeTypeDefinition[];
}

export const NodeTypeDefinitionProvider = createInterfaceId<NodeTypeDefinitionProvider>(
  'NodeTypeDefinitionProvider',
);
