import type { Node, NodeConfig, NodeId, NodeTypeDefinition } from '../types';
import { generateNodeId } from './id';

export interface NodeValidationResult {
  valid: boolean;
  errors?: string[];
}

export function validateNodeConfig(
  node: Node,
  definitions: NodeTypeDefinition[],
): NodeValidationResult {
  const definition = definitions.find((def) => def.type === node.type);

  if (!definition) {
    return {
      valid: false,
      errors: [`Unknown node type: ${node.type}`],
    };
  }

  return { valid: true };
}

export function createNodeFromDefinition(
  definition: NodeTypeDefinition,
  position: { x: number; y: number },
  id?: NodeId,
): Node {
  const nodeId = id || generateNodeId();
  const defaultLabel = `${definition.type.replace(/-g/, '_')}_${Date.now() % 10000}`;

  return {
    id: nodeId,
    label: defaultLabel,
    type: definition.type,
    position,
    config: getDefaultConfig(definition.type),
  };
}

function getDefaultConfig(type: NodeTypeDefinition['type']): NodeConfig {
  switch (type) {
    case 'agent':
      return { promptMode: 'local', toolset: [] };
    case 'ai-task':
      return { promptMode: 'local', toolset: [], maxCorrectionAttempts: 3 };
    case 'tool':
      return { toolName: '', toolset: [] };
    default:
      return {};
  }
}

export interface NodeDisplayInfo {
  label: string;
  description: string;
  color: string;
  icon: string;
}

export function getNodeDisplayInfo(node: Node, definitions: NodeTypeDefinition[]): NodeDisplayInfo {
  const definition = definitions.find((def) => def.type === node.type);

  if (!definition) {
    return {
      label: node.type,
      description: 'Unknown node type',
      color: '#6b7280',
      icon: '❓',
    };
  }

  return {
    label: definition.label,
    description: definition.description || '',
    color: definition.ui?.color || '#6b7280',
    icon: definition.ui?.icon || '◯',
  };
}
