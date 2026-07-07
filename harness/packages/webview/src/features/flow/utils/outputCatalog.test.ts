import { describe, it, expect } from 'vitest';
import { RUNTIME_PROVIDED_VARIABLE_DEFINITIONS } from '@gitlab-org/flow-builder/flow';
import type { Node, Edge, NodeId, EdgeId, Flow, FlowId, NodeTypeDefinition } from '../types';
import { buildAvailableOutputs, type UpstreamCache } from './outputCatalog';

// ============================================================================
// Test Helpers
// ============================================================================

function createTestNode(id: string, overrides: Partial<Node> = {}): Node {
  return {
    id: id as NodeId,
    label: `node_${id}`,
    type: 'agent',
    position: { x: 0, y: 0 },
    ...overrides,
  };
}

function createTestEdge(id: string, source: string, target: string): Edge {
  return {
    id: id as EdgeId,
    source: source as NodeId,
    target: target as NodeId,
  };
}

function createTestFlow(overrides: Partial<Flow> = {}): Flow {
  return {
    id: 'test-flow' as FlowId,
    entryPoint: null,
    nodes: {},
    edges: {},
    ...overrides,
  };
}

function createNodeTypeDefinition(
  type: string,
  outputSchema?: NodeTypeDefinition['outputSchema'],
): NodeTypeDefinition {
  return {
    type,
    label: type,
    description: `Node type: ${type}`,
    outputSchema,
  };
}

// ============================================================================
// Tests
// ============================================================================

describe('buildAvailableOutputs', () => {
  // --------------------------------------------------------------------------
  // Upstream-only filtering
  // --------------------------------------------------------------------------

  describe('upstream-only filtering', () => {
    it('returns outputs from upstream nodes only, not from self or downstream', () => {
      // A → B → C (target = B, so only A is upstream; C is downstream)
      const nodes = {
        ['A' as NodeId]: createTestNode('A'),
        ['B' as NodeId]: createTestNode('B'),
        ['C' as NodeId]: createTestNode('C'),
      } as Flow['nodes'];

      const edges = {
        ['e1' as EdgeId]: createTestEdge('e1', 'A', 'B'),
        ['e2' as EdgeId]: createTestEdge('e2', 'B', 'C'),
      } as Flow['edges'];

      const flow = createTestFlow({ nodes, edges });

      const outputs = buildAvailableOutputs(flow, 'B' as NodeId, [], [], []);

      // Only node A's outputs should appear (generic fallback)
      expect(outputs).toHaveLength(1);
      expect(outputs[0]?.sourceNodeId).toBe('A');

      // No output from B (self) or C (downstream)
      const sourceIds = outputs.map((o) => o.sourceNodeId);
      expect(sourceIds).not.toContain('B');
      expect(sourceIds).not.toContain('C');
    });

    it('returns outputs from multiple upstream nodes in a diamond', () => {
      //   A
      //  / \
      // B   C
      //  \ /
      //   D  (target)
      const nodes = {
        ['A' as NodeId]: createTestNode('A'),
        ['B' as NodeId]: createTestNode('B'),
        ['C' as NodeId]: createTestNode('C'),
        ['D' as NodeId]: createTestNode('D'),
      } as Flow['nodes'];

      const edges = {
        ['e1' as EdgeId]: createTestEdge('e1', 'A', 'B'),
        ['e2' as EdgeId]: createTestEdge('e2', 'A', 'C'),
        ['e3' as EdgeId]: createTestEdge('e3', 'B', 'D'),
        ['e4' as EdgeId]: createTestEdge('e4', 'C', 'D'),
      } as Flow['edges'];

      const flow = createTestFlow({ nodes, edges });

      const outputs = buildAvailableOutputs(flow, 'D' as NodeId, [], [], []);

      // All three upstream nodes (A, B, C) should contribute outputs
      const sourceIds = new Set(outputs.map((o) => o.sourceNodeId));
      expect(sourceIds).toContain('A');
      expect(sourceIds).toContain('B');
      expect(sourceIds).toContain('C');
      expect(sourceIds).not.toContain('D');
    });

    it('returns empty outputs for a node with no upstream', () => {
      const nodes = {
        ['A' as NodeId]: createTestNode('A'),
      } as Flow['nodes'];

      const flow = createTestFlow({ nodes });

      const outputs = buildAvailableOutputs(flow, 'A' as NodeId, [], [], []);
      expect(outputs).toHaveLength(0);
    });
  });

  // --------------------------------------------------------------------------
  // Generic final_answer fallback
  // --------------------------------------------------------------------------

  describe('generic final_answer fallback', () => {
    it('returns final_answer when node has no outputSchema and no tool match', () => {
      const nodes = {
        ['A' as NodeId]: createTestNode('A'),
        ['B' as NodeId]: createTestNode('B'),
      } as Flow['nodes'];

      const edges = {
        ['e1' as EdgeId]: createTestEdge('e1', 'A', 'B'),
      } as Flow['edges'];

      const flow = createTestFlow({ nodes, edges });

      const outputs = buildAvailableOutputs(flow, 'B' as NodeId, [], [], []);

      expect(outputs).toHaveLength(1);
      expect(outputs[0]).toMatchObject({
        path: 'context:A.final_answer',
        displayPath: 'context:node_A.final_answer',
        label: 'node_A → Final Answer',
        sourceNodeId: 'A',
        sourceNodeLabel: 'node_A',
        schemaType: 'string',
      });
    });
  });

  // --------------------------------------------------------------------------
  // Node type definition outputSchema fallback
  // --------------------------------------------------------------------------

  describe('node type definition outputSchema fallback', () => {
    it('uses node type definition outputSchema when no tool schema matches', () => {
      const nodes = {
        ['A' as NodeId]: createTestNode('A', { type: 'agent' }),
        ['B' as NodeId]: createTestNode('B'),
      } as Flow['nodes'];

      const edges = {
        ['e1' as EdgeId]: createTestEdge('e1', 'A', 'B'),
      } as Flow['edges'];

      const flow = createTestFlow({ nodes, edges });

      const nodeDefs = [
        createNodeTypeDefinition('agent', {
          type: 'object',
          properties: {
            final_answer: { type: 'string', description: 'Agent final answer' },
            reasoning: { type: 'string', description: 'Chain of thought' },
          },
        }),
      ];

      const outputs = buildAvailableOutputs(flow, 'B' as NodeId, nodeDefs, [], []);

      expect(outputs).toHaveLength(2);

      const answerOutput = outputs.find((o) => o.path === 'context:A.final_answer');
      expect(answerOutput).toBeDefined();
      expect(answerOutput?.schemaType).toBe('string');
      expect(answerOutput?.description).toBe('Agent final answer');

      const reasoningOutput = outputs.find((o) => o.path === 'context:A.reasoning');
      expect(reasoningOutput).toBeDefined();
      expect(reasoningOutput?.description).toBe('Chain of thought');
    });
  });

  // --------------------------------------------------------------------------
  // Workflow context variables (context:goal)
  // --------------------------------------------------------------------------

  describe('workflow context variables', () => {
    it('includes context:goal when entry point is upstream', () => {
      const nodes = {
        ['A' as NodeId]: createTestNode('A'),
        ['B' as NodeId]: createTestNode('B'),
      } as Flow['nodes'];

      const edges = {
        ['e1' as EdgeId]: createTestEdge('e1', 'A', 'B'),
      } as Flow['edges'];

      const flow = createTestFlow({
        entryPoint: 'A' as NodeId,
        nodes,
        edges,
      });

      const outputs = buildAvailableOutputs(
        flow,
        'B' as NodeId,
        [],
        [],
        RUNTIME_PROVIDED_VARIABLE_DEFINITIONS,
      );

      const goalOutput = outputs.find((o) => o.path === 'context:goal');
      expect(goalOutput).toBeDefined();
      expect(goalOutput).toMatchObject({
        path: 'context:goal',
        displayPath: 'context:goal',
        label: 'Workflow Goal',
        sourceNodeId: '',
        sourceNodeLabel: '(runtime)',
        schemaType: 'string',
        availability: 'always',
      });
    });

    it('does not include context:goal when entry point is not upstream', () => {
      // A → B, but entry point is null
      const nodes = {
        ['A' as NodeId]: createTestNode('A'),
        ['B' as NodeId]: createTestNode('B'),
      } as Flow['nodes'];

      const edges = {
        ['e1' as EdgeId]: createTestEdge('e1', 'A', 'B'),
      } as Flow['edges'];

      const flow = createTestFlow({ nodes, edges, entryPoint: null });

      const outputs = buildAvailableOutputs(
        flow,
        'B' as NodeId,
        [],
        [],
        RUNTIME_PROVIDED_VARIABLE_DEFINITIONS,
      );

      const goalOutput = outputs.find((o) => o.path === 'context:goal');
      expect(goalOutput).toBeUndefined();
    });

    it('does not include context:goal when target node is disconnected from entry point', () => {
      // Entry = A → B; disconnected: X → Y (target = Y)
      const nodes = {
        ['A' as NodeId]: createTestNode('A'),
        ['B' as NodeId]: createTestNode('B'),
        ['X' as NodeId]: createTestNode('X'),
        ['Y' as NodeId]: createTestNode('Y'),
      } as Flow['nodes'];

      const edges = {
        ['e1' as EdgeId]: createTestEdge('e1', 'A', 'B'),
        ['e2' as EdgeId]: createTestEdge('e2', 'X', 'Y'),
      } as Flow['edges'];

      const flow = createTestFlow({
        entryPoint: 'A' as NodeId,
        nodes,
        edges,
      });

      const outputs = buildAvailableOutputs(
        flow,
        'Y' as NodeId,
        [],
        [],
        RUNTIME_PROVIDED_VARIABLE_DEFINITIONS,
      );

      const goalOutput = outputs.find((o) => o.path === 'context:goal');
      expect(goalOutput).toBeUndefined();
    });

    it('does not synthesize workflow inputs from existing parameter bindings', () => {
      // Previously `buildAvailableOutputs` scanned bindings and re-surfaced any
      // referenced root as a synthetic workflow input. That masked deletion of
      // a real input because the reference itself kept re-creating the entry.
      // `flow.inputs` + the default `goal` are now the authoritative source.
      const nodes = {
        ['A' as NodeId]: createTestNode('A'),
        ['B' as NodeId]: createTestNode('B', {
          config: {
            parameterBindings: [
              {
                parameter: 'repo',
                kind: 'reference' as const,
                referencePath: 'context:repo_url.value',
              },
            ],
          },
        }),
      } as Flow['nodes'];

      const edges = {
        ['e1' as EdgeId]: createTestEdge('e1', 'A', 'B'),
      } as Flow['edges'];

      const flow = createTestFlow({
        entryPoint: 'A' as NodeId,
        nodes,
        edges,
      });

      const outputs = buildAvailableOutputs(flow, 'B' as NodeId, [], [], []);
      expect(outputs.find((o) => o.path === 'context:repo_url')).toBeUndefined();
    });

    it('does not synthesize workflow inputs from legacy label-based inputs', () => {
      const nodes = {
        ['A' as NodeId]: createTestNode('A'),
        ['B' as NodeId]: createTestNode('B', {
          config: {
            inputs: [{ from: 'context:project_name.title' }],
          },
        }),
      } as Flow['nodes'];

      const edges = {
        ['e1' as EdgeId]: createTestEdge('e1', 'A', 'B'),
      } as Flow['edges'];

      const flow = createTestFlow({
        entryPoint: 'A' as NodeId,
        nodes,
        edges,
      });

      const outputs = buildAvailableOutputs(flow, 'B' as NodeId, [], [], []);
      expect(outputs.find((o) => o.path === 'context:project_name')).toBeUndefined();
    });

    it('does not duplicate goal in custom context variables', () => {
      const nodes = {
        ['A' as NodeId]: createTestNode('A'),
        ['B' as NodeId]: createTestNode('B', {
          config: {
            parameterBindings: [
              { parameter: 'input', kind: 'reference' as const, referencePath: 'context:goal' },
            ],
          },
        }),
      } as Flow['nodes'];

      const edges = {
        ['e1' as EdgeId]: createTestEdge('e1', 'A', 'B'),
      } as Flow['edges'];

      const flow = createTestFlow({
        entryPoint: 'A' as NodeId,
        nodes,
        edges,
      });

      const outputs = buildAvailableOutputs(
        flow,
        'B' as NodeId,
        [],
        [],
        RUNTIME_PROVIDED_VARIABLE_DEFINITIONS,
      );

      const goalOutputs = outputs.filter((o) => o.path === 'context:goal');
      expect(goalOutputs).toHaveLength(1);
    });

    it('does not surface component names from legacy inputs as context variables', () => {
      // Simulates a node loaded from V1 YAML that has legacy label-based inputs.
      // "no_agent" is a component name, not a workflow variable.
      const nodes = {
        ['A' as NodeId]: createTestNode('A', { sourceComponentName: 'no_agent' }),
        ['B' as NodeId]: createTestNode('B', {
          config: {
            inputs: [{ from: 'context:no_agent.result', as: 'data' }],
          },
        }),
      } as Flow['nodes'];

      const edges = {
        ['e1' as EdgeId]: createTestEdge('e1', 'A', 'B'),
      } as Flow['edges'];

      const flow = createTestFlow({
        entryPoint: 'A' as NodeId,
        nodes,
        edges,
      });

      const outputs = buildAvailableOutputs(flow, 'B' as NodeId, [], [], []);

      // "no_agent" should NOT appear as a workflow context variable
      const spurious = outputs.find((o) => o.path === 'context:no_agent');
      expect(spurious).toBeUndefined();
    });
  });

  // --------------------------------------------------------------------------
  // ID-based path vs label-based displayPath
  // --------------------------------------------------------------------------

  describe('path uses IDs, displayPath uses labels', () => {
    it('path field uses node ID, displayPath uses node label', () => {
      const nodes = {
        ['uuid-123' as NodeId]: createTestNode('uuid-123', { label: 'My Analyzer' }),
        ['uuid-456' as NodeId]: createTestNode('uuid-456'),
      } as Flow['nodes'];

      const edges = {
        ['e1' as EdgeId]: createTestEdge('e1', 'uuid-123', 'uuid-456'),
      } as Flow['edges'];

      const flow = createTestFlow({ nodes, edges });

      const outputs = buildAvailableOutputs(flow, 'uuid-456' as NodeId, [], [], []);

      expect(outputs).toHaveLength(1);
      // path uses the node ID
      expect(outputs[0]?.path).toBe('context:uuid-123.final_answer');
      // displayPath uses the node label
      expect(outputs[0]?.displayPath).toBe('context:My Analyzer.final_answer');
      // label is human readable
      expect(outputs[0]?.label).toBe('My Analyzer → Final Answer');
    });

    it('workflow context vars use same value for path and displayPath', () => {
      const nodes = {
        ['A' as NodeId]: createTestNode('A'),
        ['B' as NodeId]: createTestNode('B'),
      } as Flow['nodes'];

      const edges = {
        ['e1' as EdgeId]: createTestEdge('e1', 'A', 'B'),
      } as Flow['edges'];

      const flow = createTestFlow({
        entryPoint: 'A' as NodeId,
        nodes,
        edges,
      });

      const outputs = buildAvailableOutputs(
        flow,
        'B' as NodeId,
        [],
        [],
        RUNTIME_PROVIDED_VARIABLE_DEFINITIONS,
      );

      const goalOutput = outputs.find((o) => o.path === 'context:goal');
      expect(goalOutput?.path).toBe(goalOutput?.displayPath);
    });
  });

  // --------------------------------------------------------------------------
  // UpstreamCache behavior
  // --------------------------------------------------------------------------

  describe('upstreamCache', () => {
    it('populates the cache on first call and reuses it on second', () => {
      const nodes = {
        ['A' as NodeId]: createTestNode('A'),
        ['B' as NodeId]: createTestNode('B'),
        ['C' as NodeId]: createTestNode('C'),
      } as Flow['nodes'];

      const edges = {
        ['e1' as EdgeId]: createTestEdge('e1', 'A', 'B'),
        ['e2' as EdgeId]: createTestEdge('e2', 'B', 'C'),
      } as Flow['edges'];

      const flow = createTestFlow({ nodes, edges });

      const cache: UpstreamCache = new Map();

      // First call: cache is empty, should populate it
      const outputsC = buildAvailableOutputs(flow, 'C' as NodeId, [], [], [], cache);
      expect(cache.has('C' as NodeId)).toBe(true);
      expect(cache.get('C' as NodeId)?.has('A' as NodeId)).toBe(true);
      expect(cache.get('C' as NodeId)?.has('B' as NodeId)).toBe(true);

      // Second call for B: should populate that entry too
      const outputsB = buildAvailableOutputs(flow, 'B' as NodeId, [], [], [], cache);
      expect(cache.has('B' as NodeId)).toBe(true);
      expect(cache.get('B' as NodeId)?.has('A' as NodeId)).toBe(true);

      // Results should be consistent
      expect(outputsC).toHaveLength(2); // A and B
      expect(outputsB).toHaveLength(1); // only A
    });

    it('uses pre-populated cache without recomputing', () => {
      const nodes = {
        ['A' as NodeId]: createTestNode('A'),
        ['B' as NodeId]: createTestNode('B'),
        ['C' as NodeId]: createTestNode('C'),
      } as Flow['nodes'];

      const edges = {
        ['e1' as EdgeId]: createTestEdge('e1', 'A', 'B'),
        ['e2' as EdgeId]: createTestEdge('e2', 'B', 'C'),
      } as Flow['edges'];

      const flow = createTestFlow({ nodes, edges });

      // Pre-populate cache with a custom set (only B, not A)
      const cache: UpstreamCache = new Map();
      cache.set('C' as NodeId, new Set(['B' as NodeId]));

      const outputs = buildAvailableOutputs(flow, 'C' as NodeId, [], [], [], cache);

      // Should only include B (from the cache), not A
      expect(outputs).toHaveLength(1);
      expect(outputs[0]?.sourceNodeId).toBe('B');
    });
  });
});

describe('UpstreamCache type export', () => {
  it('is exported and usable as Map<NodeId, Set<NodeId>>', () => {
    const cache: UpstreamCache = new Map();
    cache.set('node-1' as NodeId, new Set(['node-0' as NodeId]));

    expect(cache.get('node-1' as NodeId)?.has('node-0' as NodeId)).toBe(true);
  });
});
