import type { Flow, FlowId, NodeId, EdgeId } from '../types';
import type { LayoutOptions } from './layout';
import { computeFlowLayout } from './layout';

const DEFAULTS: Required<LayoutOptions> = {
  direction: 'TB',
  nodeSpacingX: 80,
  nodeSpacingY: 100,
  nodeWidth: 280,
  nodeHeight: 80,
  startNodePosition: { x: 0, y: 0 },
  startNodeGap: 120,
};

function makeNodeId(id: string): NodeId {
  return id as NodeId;
}

function makeFlow(
  nodes: Record<string, string>, // id → label
  edges: [string, string][] = [],
  entryPoint?: string,
): Flow {
  const nodeEntries: Flow['nodes'] = {};
  for (const [id, label] of Object.entries(nodes)) {
    nodeEntries[makeNodeId(id)] = {
      id: makeNodeId(id),
      label,
      type: 'agent',
      position: { x: 0, y: 0 },
    };
  }

  const edgeEntries: Flow['edges'] = {};
  for (const [source, target] of edges) {
    const edgeId = `edge-${source}-${target}` as EdgeId;
    edgeEntries[edgeId] = {
      id: edgeId,
      source: makeNodeId(source),
      target: makeNodeId(target),
    };
  }

  return {
    id: 'test' as FlowId,
    entryPoint: entryPoint ? makeNodeId(entryPoint) : null,
    nodes: nodeEntries,
    edges: edgeEntries,
  };
}

describe('computeFlowLayout', () => {
  it('returns empty record for empty flow', () => {
    const flow = makeFlow({});
    const result = computeFlowLayout(flow);
    expect(result).toEqual({});
  });

  it('positions a single node below the START node', () => {
    const flow = makeFlow({ a: 'step_one' }, [], 'a');
    const result = computeFlowLayout(flow);

    const expectedY = DEFAULTS.startNodePosition.y + DEFAULTS.nodeHeight + DEFAULTS.startNodeGap;
    expect(result[makeNodeId('a')]).toEqual({ x: 0, y: expectedY });
  });

  it('produces positions for all nodes in a linear chain', () => {
    const flow = makeFlow(
      { a: 'first', b: 'second', c: 'third' },
      [
        ['a', 'b'],
        ['b', 'c'],
      ],
      'a',
    );
    const result = computeFlowLayout(flow);

    const posA = result[makeNodeId('a')];
    const posB = result[makeNodeId('b')];
    const posC = result[makeNodeId('c')];

    // All nodes should have positions
    expect(posA).toBeDefined();
    expect(posB).toBeDefined();
    expect(posC).toBeDefined();

    // In TB direction, each subsequent node should be further down
    expect(posB.y).toBeGreaterThan(posA.y);
    expect(posC.y).toBeGreaterThan(posB.y);

    // Entry point should be below START
    const expectedY = DEFAULTS.startNodePosition.y + DEFAULTS.nodeHeight + DEFAULTS.startNodeGap;
    expect(posA.y).toBe(expectedY);
  });

  it('places branching nodes side by side', () => {
    // a → b, a → c (fork)
    const flow = makeFlow(
      { a: 'root', b: 'left', c: 'right' },
      [
        ['a', 'b'],
        ['a', 'c'],
      ],
      'a',
    );
    const result = computeFlowLayout(flow);

    const posB = result[makeNodeId('b')];
    const posC = result[makeNodeId('c')];

    // Both children at the same rank (same y), different x
    expect(posB.y).toBe(posC.y);
    expect(posB.x).not.toBe(posC.x);
  });

  it('supports LR direction', () => {
    const flow = makeFlow({ a: 'first', b: 'second' }, [['a', 'b']], 'a');
    const result = computeFlowLayout(flow, { direction: 'LR' });

    const posA = result[makeNodeId('a')];
    const posB = result[makeNodeId('b')];

    // In LR, nodes should progress left-to-right
    expect(posB.x).toBeGreaterThan(posA.x);

    // Entry point should be beside START
    const expectedX = DEFAULTS.startNodePosition.x + DEFAULTS.nodeWidth + DEFAULTS.startNodeGap;
    expect(posA.x).toBe(expectedX);
  });

  it('handles disconnected nodes', () => {
    const flow = makeFlow({ a: 'connected', b: 'disconnected' }, [], 'a');
    const result = computeFlowLayout(flow);

    // Both nodes should have positions
    expect(result[makeNodeId('a')]).toBeDefined();
    expect(result[makeNodeId('b')]).toBeDefined();
  });

  it('handles flow with no entry point', () => {
    const flow = makeFlow({ a: 'first', b: 'second' }, [['a', 'b']]);
    const result = computeFlowLayout(flow);

    // Should still produce positions for all nodes
    expect(result[makeNodeId('a')]).toBeDefined();
    expect(result[makeNodeId('b')]).toBeDefined();
  });

  it('respects custom startNodePosition', () => {
    const flow = makeFlow({ a: 'step' }, [], 'a');
    const result = computeFlowLayout(flow, {
      startNodePosition: { x: 100, y: 50 },
    });

    // Entry point should be offset from the custom start position
    const expectedY = 50 + DEFAULTS.nodeHeight + DEFAULTS.startNodeGap;
    expect(result[makeNodeId('a')]).toEqual({ x: 100, y: expectedY });
  });

  it('respects custom startNodeGap', () => {
    const flow = makeFlow({ a: 'step' }, [], 'a');
    const result = computeFlowLayout(flow, { startNodeGap: 200 });

    const expectedY = DEFAULTS.startNodePosition.y + DEFAULTS.nodeHeight + 200;
    expect(result[makeNodeId('a')]).toEqual({ x: 0, y: expectedY });
  });
});
