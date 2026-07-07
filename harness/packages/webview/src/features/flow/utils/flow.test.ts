import { describe, it, expect } from 'vitest';
import type { Flow, FlowId, NodeId, EdgeId } from '../types';
import { getEffectiveFlowInputs } from './flow';

function createTestFlow(overrides: Partial<Flow> = {}): Flow {
  return {
    id: 'test-flow' as FlowId,
    entryPoint: null,
    nodes: {},
    edges: {},
    ...overrides,
  };
}

describe('getEffectiveFlowInputs', () => {
  it('returns empty array when flow has no inputs', () => {
    const flow = createTestFlow({ inputs: undefined });
    expect(getEffectiveFlowInputs(flow)).toEqual([]);
  });

  it('returns declared flow inputs with their metadata', () => {
    const flow = createTestFlow({
      inputs: [
        { name: 'ticket_url', description: 'GitLab issue URL', type: 'string' },
        { name: 'branch_name', description: 'Target branch', type: 'string', format: 'multiline' },
      ],
    });

    const result = getEffectiveFlowInputs(flow);
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({
      name: 'ticket_url',
      label: 'GitLab issue URL',
      multiline: false,
    });
    expect(result[1]).toMatchObject({
      name: 'branch_name',
      label: 'Target branch',
      multiline: true,
    });
  });

  it('discovers undeclared context references from parameterBindings', () => {
    const flow = createTestFlow({
      inputs: [],
      nodes: {
        ['node-1' as NodeId]: {
          id: 'node-1' as NodeId,
          label: 'Agent',
          type: 'agent',
          position: { x: 0, y: 0 },
          config: {
            parameterBindings: [
              { parameter: 'repo', kind: 'reference', referencePath: 'context:repo_url' },
            ],
          },
        },
      },
    });

    const result = getEffectiveFlowInputs(flow);
    expect(result).toHaveLength(1);
    expect(result[0]?.name).toBe('repo_url');
  });

  it('does not surface runtime-provided variables as execution inputs even when referenced in bindings', () => {
    const flow = createTestFlow({
      inputs: [],
      nodes: {
        ['node-1' as NodeId]: {
          id: 'node-1' as NodeId,
          label: 'Agent',
          type: 'agent',
          position: { x: 0, y: 0 },
          config: {
            parameterBindings: [
              { parameter: 'g', kind: 'reference', referencePath: 'context:goal' },
              { parameter: 'pid', kind: 'reference', referencePath: 'context:project_id' },
              {
                parameter: 'url',
                kind: 'reference',
                referencePath: 'context:project_http_url_to_repo',
              },
              {
                parameter: 'branch',
                kind: 'reference',
                referencePath: 'context:project_default_branch',
              },
              { parameter: 'date', kind: 'reference', referencePath: 'context:current_date' },
              { parameter: 'wid', kind: 'reference', referencePath: 'context:workflow_id' },
              { parameter: 'sess', kind: 'reference', referencePath: 'context:session_url' },
              {
                parameter: 'os',
                kind: 'reference',
                referencePath: 'context:inputs.os_information',
              },
            ],
          },
        },
      },
    });

    expect(getEffectiveFlowInputs(flow)).toHaveLength(0);
  });

  it('does not duplicate declared inputs found again in bindings', () => {
    const flow = createTestFlow({
      inputs: [{ name: 'ticket_url', description: 'Ticket', type: 'string' }],
      nodes: {
        ['node-1' as NodeId]: {
          id: 'node-1' as NodeId,
          label: 'Agent',
          type: 'agent',
          position: { x: 0, y: 0 },
          config: {
            parameterBindings: [
              { parameter: 'u', kind: 'reference', referencePath: 'context:ticket_url' },
            ],
          },
        },
      },
    });

    const result = getEffectiveFlowInputs(flow);
    expect(result).toHaveLength(1);
    expect(result[0]?.name).toBe('ticket_url');
    expect(result[0]?.label).toBe('Ticket'); // declared metadata preserved
  });

  it('does not surface node ID references as inputs', () => {
    const nodeId = 'abc-123' as NodeId;
    const flow = createTestFlow({
      inputs: [],
      nodes: {
        [nodeId]: {
          id: nodeId,
          label: 'Upstream',
          type: 'agent',
          position: { x: 0, y: 0 },
        },
        ['node-2' as NodeId]: {
          id: 'node-2' as NodeId,
          label: 'Downstream',
          type: 'agent',
          position: { x: 0, y: 0 },
          config: {
            parameterBindings: [
              {
                parameter: 'x',
                kind: 'reference',
                referencePath: `context:${nodeId}.final_answer`,
              },
            ],
          },
        },
      },
      edges: {
        ['e1' as EdgeId]: { id: 'e1' as EdgeId, source: nodeId, target: 'node-2' as NodeId },
      },
    });

    expect(getEffectiveFlowInputs(flow)).toHaveLength(0);
  });
});
