import { describe, it, expect } from 'vitest';
import type { AvailableOutput } from '../../../utils/outputCatalog';
import type { NodeId } from '../../../types';
import { hydrateMergeField } from './hydrateMergeField';

function makeOutput(path: string, label: string, sourceNodeType = 'agent'): AvailableOutput {
  return {
    path,
    displayPath: path,
    label,
    sourceNodeId: 'node-1' as NodeId,
    sourceNodeLabel: 'My Node',
    schemaType: 'string',
    sourceNodeType,
  };
}

describe('hydrateMergeField', () => {
  describe('runtime variables', () => {
    it('marks history as runtime status', () => {
      const result = hydrateMergeField('history', { availableOutputs: [] });
      expect(result.status).toBe('runtime');
      expect(result.displayLabel).toBe('Conversation History');
      expect(result.sourceNodeType).toBe('runtime');
    });
  });

  describe('bound paths', () => {
    it('resolves a varName with a pre-existing bound path', () => {
      const outputs = [makeOutput('context:node-1.final_answer', 'My Agent → Final Answer')];
      const result = hydrateMergeField('final_answer', {
        availableOutputs: outputs,
        boundPaths: { final_answer: 'context:node-1.final_answer' },
      });
      expect(result.status).toBe('valid');
      expect(result.path).toBe('context:node-1.final_answer');
      expect(result.displayLabel).toBe('My Agent → Final Answer');
    });

    it('marks as broken when bound path no longer exists in outputs', () => {
      const result = hydrateMergeField('result', {
        availableOutputs: [],
        boundPaths: { result: 'context:deleted-node.output' },
      });
      expect(result.status).toBe('broken');
      expect(result.path).toBe('context:deleted-node.output');
    });
  });

  describe('auto-match by last path segment', () => {
    it('matches varName against the last segment of an output path', () => {
      const outputs = [makeOutput('context:node-1.final_answer', 'My Agent → Final Answer')];
      const result = hydrateMergeField('final_answer', { availableOutputs: outputs });
      expect(result.status).toBe('valid');
      expect(result.path).toBe('context:node-1.final_answer');
    });

    it('matches bare context variables like goal', () => {
      const outputs = [makeOutput('context:goal', 'Workflow Goal', 'workflow')];
      const result = hydrateMergeField('goal', { availableOutputs: outputs });
      expect(result.status).toBe('valid');
      expect(result.path).toBe('context:goal');
    });
  });

  describe('legacy full context paths embedded in prompt text', () => {
    it('resolves a full context path to valid when it exists in outputs', () => {
      const outputs = [makeOutput('context:node-1.final_answer', 'My Agent → Final Answer')];
      const result = hydrateMergeField('context:node-1.final_answer', {
        availableOutputs: outputs,
      });
      expect(result.status).toBe('valid');
      expect(result.path).toBe('context:node-1.final_answer');
      // varName is derived to the short field name
      expect(result.varName).toBe('final_answer');
      expect(result.displayLabel).toBe('My Agent → Final Answer');
    });

    it('marks a full context path as broken when the node no longer exists', () => {
      const result = hydrateMergeField('context:deleted-node.output', { availableOutputs: [] });
      expect(result.status).toBe('broken');
      expect(result.path).toBe('context:deleted-node.output');
    });
  });

  describe('unknown variables', () => {
    it('marks unrecognized variables as unknown', () => {
      const result = hydrateMergeField('steve', { availableOutputs: [] });
      expect(result.status).toBe('unknown');
      expect(result.varName).toBe('steve');
      expect(result.path).toBe('steve');
    });
  });
});
