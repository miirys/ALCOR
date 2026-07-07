import { AgentComponentNodeTypeDefinition } from './agent_component_node_definition';
import { DeterministicStepComponentNodeTypeDefinition } from './deterministic_step_component_node_definition';
import { OneOffStepComponentNodeTypeDefinition } from './one_off_component_node_definition';

export const NODE_DEFINITIONS = [
  AgentComponentNodeTypeDefinition,
  DeterministicStepComponentNodeTypeDefinition,
  OneOffStepComponentNodeTypeDefinition,
];
