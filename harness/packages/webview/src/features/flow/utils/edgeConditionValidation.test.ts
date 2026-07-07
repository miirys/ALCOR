import { describe, it, expect } from 'vitest';
import type {
  Node,
  Edge,
  NodeId,
  EdgeId,
  Flow,
  FlowId,
  NodeTypeDefinition,
  ToolDefinition,
  RuntimeProvidedVariableDefinition,
} from '../types';
import { validateAllEdgeConditions, validateEdgeCondition } from './edgeConditionValidation';

function node(id: string, label = `Node_${id}`): Node {
  return {
    id: id as NodeId,
    label,
    type: 'agent',
    position: { x: 0, y: 0 },
  };
}

function edge(id: string, source: string, target: string, condition?: object): Edge {
  return {
    id: id as EdgeId,
    source: source as NodeId,
    target: target as NodeId,
    ...(condition === undefined ? {} : { condition: JSON.stringify(condition) }),
  };
}

function makeFlow(
  nodes: Node[],
  edges: Edge[],
  inputs: Flow['inputs'] = [],
  entryPoint: NodeId | null = null,
): Flow {
  return {
    id: 'test-flow' as FlowId,
    entryPoint,
    nodes: Object.fromEntries(nodes.map((n) => [n.id, n])),
    edges: Object.fromEntries(edges.map((e) => [e.id, e])),
    inputs,
  };
}

const NO_NODE_DEFS: NodeTypeDefinition[] = [];
const NO_TOOL_DEFS: ToolDefinition[] = [];
const NO_RUNTIME_VARS: RuntimeProvidedVariableDefinition[] = [];

function callValidate(flow: Flow, e: Edge) {
  return validateEdgeCondition(flow, e, NO_NODE_DEFS, NO_TOOL_DEFS, NO_RUNTIME_VARS);
}

describe('validateEdgeCondition', () => {
  it('reports no-condition for unconditional edges', () => {
    const a = node('a', 'analyzer');
    const b = node('b', 'summarizer');
    const e = edge('e1', 'a', 'b');
    const flow = makeFlow([a, b], [e]);

    expect(callValidate(flow, e).status).toEqual({ state: 'no-condition' });
  });

  it('accepts a condition that references the edge source node by ID', () => {
    const a = node('a', 'analyzer');
    const b = node('b', 'summarizer');
    const e = edge('e1', 'a', 'b', { input: 'context:a.status', value: 'success' });
    const flow = makeFlow([a, b], [e]);

    expect(callValidate(flow, e).status).toEqual({ state: 'valid' });
  });

  it('accepts a condition that references the edge source by label', () => {
    const a = node('a', 'analyzer');
    const b = node('b', 'summarizer');
    const e = edge('e1', 'a', 'b', { input: 'context:analyzer.status', value: 'success' });
    const flow = makeFlow([a, b], [e]);

    expect(callValidate(flow, e).status).toEqual({ state: 'valid' });
  });

  it('accepts a condition that references an upstream node', () => {
    const a = node('a', 'reader');
    const b = node('b', 'analyzer');
    const c = node('c', 'summarizer');
    const e1 = edge('e1', 'a', 'b');
    const e2 = edge('e2', 'b', 'c', { input: 'context:reader.content', value: 'ok' });
    const flow = makeFlow([a, b, c], [e1, e2]);

    expect(callValidate(flow, e2).status).toEqual({ state: 'valid' });
  });

  it('flags a reference to a non-upstream node', () => {
    const a = node('a', 'reader');
    const b = node('b', 'analyzer');
    const c = node('c', 'summarizer');
    // a → b, b → c. From edge a→b, "summarizer" is downstream, not upstream.
    const e1 = edge('e1', 'a', 'b', { input: 'context:summarizer.text', value: 'ok' });
    const e2 = edge('e2', 'b', 'c');
    const flow = makeFlow([a, b, c], [e1, e2]);

    const result = callValidate(flow, e1);
    expect(result.status).toEqual({
      state: 'unknown-root',
      root: 'summarizer',
      suggestion: undefined,
    });
    expect(result.message).toMatch(/summarizer/);
  });

  it('suggests a near-miss when the root looks like a typo of an upstream label', () => {
    const a = node('a', 'analyzer');
    const b = node('b', 'summarizer');
    const e = edge('e1', 'a', 'b', { input: 'context:anaylzer.status', value: 'success' });
    const flow = makeFlow([a, b], [e]);

    const result = callValidate(flow, e);
    expect(result.status).toEqual({
      state: 'unknown-root',
      root: 'anaylzer',
      suggestion: 'analyzer',
    });
    expect(result.message).toMatch(/did you mean "analyzer"/);
  });

  it('accepts a workflow input reference when the source is reachable from START', () => {
    const start = node('start', 'start');
    const a = node('a', 'analyzer');
    const b = node('b', 'summarizer');
    const e1 = edge('e1', 'start', 'a');
    const e2 = edge('e2', 'a', 'b', { input: 'context:goal', value: 'done' });
    const flow = makeFlow(
      [start, a, b],
      [e1, e2],
      [{ name: 'goal', type: 'string' }],
      'start' as NodeId,
    );

    expect(callValidate(flow, e2).status).toEqual({ state: 'valid' });
  });

  it('accepts a status: prefixed reference to an upstream node', () => {
    const a = node('a', 'analyzer');
    const b = node('b', 'summarizer');
    const e = edge('e1', 'a', 'b', { input: 'status:analyzer', value: 'completed' });
    const flow = makeFlow([a, b], [e]);

    expect(callValidate(flow, e).status).toEqual({ state: 'valid' });
  });

  it('flags an input that does not start with context: or status:', () => {
    const a = node('a', 'analyzer');
    const b = node('b', 'summarizer');
    const e = edge('e1', 'a', 'b', { input: 'analyzer.status', value: 'success' });
    const flow = makeFlow([a, b], [e]);

    const result = callValidate(flow, e);
    expect(result.status.state).toBe('invalid-format');
    expect(result.message).toMatch(/context:.*status:/);
  });

  it('flags a prefix-only input as invalid-format, not unknown-root', () => {
    const a = node('a', 'analyzer');
    const b = node('b', 'summarizer');
    const e = edge('e1', 'a', 'b', { input: 'status:', value: 'completed' });
    const flow = makeFlow([a, b], [e]);

    const result = callValidate(flow, e);
    expect(result.status.state).toBe('invalid-format');
  });

  it('accepts a reference to a runtime-provided variable when reachable from START', () => {
    const start = node('start', 'start');
    const a = node('a', 'analyzer');
    const b = node('b', 'summarizer');
    const e1 = edge('e1', 'start', 'a');
    const e2 = edge('e2', 'a', 'b', { input: 'context:target_file', value: 'main.ts' });
    const flow = makeFlow([start, a, b], [e1, e2], [], 'start' as NodeId);

    const runtimeVars: RuntimeProvidedVariableDefinition[] = [
      {
        key: 'target_file',
        label: 'Target file',
        type: 'string',
        description: 'File the user is editing',
        availability: 'always',
      },
    ];

    const result = validateEdgeCondition(flow, e2, NO_NODE_DEFS, NO_TOOL_DEFS, runtimeVars);
    expect(result.status).toEqual({ state: 'valid' });
  });

  it('flags malformed JSON in the condition', () => {
    const a = node('a', 'analyzer');
    const b = node('b', 'summarizer');
    const e: Edge = {
      id: 'e1' as EdgeId,
      source: 'a' as NodeId,
      target: 'b' as NodeId,
      condition: 'this is not json',
    };
    const flow = makeFlow([a, b], [e]);

    const result = callValidate(flow, e);
    expect(result.status.state).toBe('malformed');
  });

  it('treats a condition with an empty input as valid', () => {
    const a = node('a', 'analyzer');
    const b = node('b', 'summarizer');
    const e = edge('e1', 'a', 'b', { input: '', value: 'success' });
    const flow = makeFlow([a, b], [e]);

    expect(callValidate(flow, e).status).toEqual({ state: 'valid' });
  });
});

describe('validateAllEdgeConditions', () => {
  it('returns one validation per edge', () => {
    const a = node('a');
    const b = node('b');
    const c = node('c');
    const e1 = edge('e1', 'a', 'b');
    const e2 = edge('e2', 'b', 'c', { input: 'context:a.x', value: 'y' });
    const flow = makeFlow([a, b, c], [e1, e2]);

    const results = validateAllEdgeConditions(flow, NO_NODE_DEFS, NO_TOOL_DEFS, NO_RUNTIME_VARS);
    expect(results).toHaveLength(2);
    expect(results.find((r) => r.edgeId === 'e1')?.status.state).toBe('no-condition');
    expect(results.find((r) => r.edgeId === 'e2')?.status.state).toBe('valid');
  });
});
