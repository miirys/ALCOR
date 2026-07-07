import { describe, it, expect } from 'vitest';
import type { JSONSchema7 } from 'json-schema';
import type { Node, NodeId, NodeTypeDefinition } from '../types';
import {
  getNodeOutputSchema,
  getNodeInputSchema,
  getSchemaOutputPaths,
  isValidSchemaPath,
  getSchemaPathDescription,
} from './schema';

// =============================================================================
// Test Fixtures
// =============================================================================

const MOCK_OUTPUT_SCHEMA: JSONSchema7 = {
  type: 'object',
  properties: {
    final_answer: {
      type: 'string',
      description: "The agent's final response",
    },
    nested: {
      type: 'object',
      properties: {
        value: {
          type: 'number',
          description: 'A nested numeric value',
        },
        deep: {
          type: 'object',
          properties: {
            data: {
              type: 'string',
              description: 'Deeply nested data',
            },
          },
        },
      },
    },
    status: {
      type: 'string',
      enum: ['success', 'failed'],
      description: 'Execution status',
    },
  },
};

const MOCK_INPUT_SCHEMA: JSONSchema7 = {
  type: 'object',
  properties: {
    goal: {
      type: 'string',
      description: 'Task goal description',
    },
  },
  required: ['goal'],
};

const TEST_DEFINITIONS: NodeTypeDefinition[] = [
  {
    type: 'agent',
    label: 'Agent',
    description: 'An agent node',
    outputSchema: MOCK_OUTPUT_SCHEMA,
    inputSchema: undefined,
  },
  {
    type: 'ai-task',
    label: 'AI Task',
    description: 'AI task node',
    outputSchema: MOCK_OUTPUT_SCHEMA,
    inputSchema: MOCK_INPUT_SCHEMA,
  },
  {
    type: 'tool',
    label: 'Tool',
    description: 'A tool node',
    // No schemas defined
  },
];

function createTestNode(id: string, type: string): Node {
  return {
    id: id as NodeId,
    label: `node_${id}`,
    type,
    position: { x: 0, y: 0 },
  };
}

// =============================================================================
// Tests
// =============================================================================

describe('schema utilities', () => {
  describe('getNodeOutputSchema', () => {
    it('returns output schema for node with defined schema', () => {
      const node = createTestNode('1', 'agent');
      const schema = getNodeOutputSchema(node, TEST_DEFINITIONS);

      expect(schema).toBe(MOCK_OUTPUT_SCHEMA);
    });

    it('returns null for node without output schema', () => {
      const node = createTestNode('1', 'tool');
      const schema = getNodeOutputSchema(node, TEST_DEFINITIONS);

      expect(schema).toBeNull();
    });

    it('returns null for unknown node type', () => {
      const node = createTestNode('1', 'unknown');
      const schema = getNodeOutputSchema(node, TEST_DEFINITIONS);

      expect(schema).toBeNull();
    });
  });

  describe('getNodeInputSchema', () => {
    it('returns input schema for node with defined schema', () => {
      const node = createTestNode('1', 'ai-task');
      const schema = getNodeInputSchema(node, TEST_DEFINITIONS);

      expect(schema).toBe(MOCK_INPUT_SCHEMA);
    });

    it('returns null for node with undefined input schema', () => {
      const node = createTestNode('1', 'agent');
      const schema = getNodeInputSchema(node, TEST_DEFINITIONS);

      expect(schema).toBeNull();
    });

    it('returns null for unknown node type', () => {
      const node = createTestNode('1', 'unknown');
      const schema = getNodeInputSchema(node, TEST_DEFINITIONS);

      expect(schema).toBeNull();
    });
  });

  describe('getSchemaOutputPaths', () => {
    it('extracts top-level property paths', () => {
      const paths = getSchemaOutputPaths(MOCK_OUTPUT_SCHEMA);

      expect(paths).toContain('final_answer');
      expect(paths).toContain('status');
      expect(paths).toContain('nested');
    });

    it('extracts nested property paths', () => {
      const paths = getSchemaOutputPaths(MOCK_OUTPUT_SCHEMA);

      expect(paths).toContain('nested.value');
      expect(paths).toContain('nested.deep');
      expect(paths).toContain('nested.deep.data');
    });

    it('handles prefix parameter', () => {
      const nestedSchema: JSONSchema7 = {
        type: 'object',
        properties: {
          value: { type: 'string' },
        },
      };
      const paths = getSchemaOutputPaths(nestedSchema, 'context:node1');

      expect(paths).toContain('context:node1.value');
    });

    it('returns empty array for null/undefined schema', () => {
      expect(getSchemaOutputPaths(null as unknown as JSONSchema7)).toEqual([]);
      expect(getSchemaOutputPaths(undefined as unknown as JSONSchema7)).toEqual([]);
    });

    it('returns empty array for non-object schema', () => {
      const schema: JSONSchema7 = { type: 'string' };
      expect(getSchemaOutputPaths(schema)).toEqual([]);
    });

    it('returns empty array for schema without properties', () => {
      const schema: JSONSchema7 = { type: 'object' };
      expect(getSchemaOutputPaths(schema)).toEqual([]);
    });
  });

  describe('isValidSchemaPath', () => {
    it('returns true for valid top-level path', () => {
      expect(isValidSchemaPath(MOCK_OUTPUT_SCHEMA, ['final_answer'])).toBe(true);
      expect(isValidSchemaPath(MOCK_OUTPUT_SCHEMA, ['status'])).toBe(true);
    });

    it('returns true for valid nested path', () => {
      expect(isValidSchemaPath(MOCK_OUTPUT_SCHEMA, ['nested', 'value'])).toBe(true);
      expect(isValidSchemaPath(MOCK_OUTPUT_SCHEMA, ['nested', 'deep', 'data'])).toBe(true);
    });

    it('returns false for invalid path', () => {
      expect(isValidSchemaPath(MOCK_OUTPUT_SCHEMA, ['nonexistent'])).toBe(false);
      expect(isValidSchemaPath(MOCK_OUTPUT_SCHEMA, ['nested', 'invalid'])).toBe(false);
    });

    it('returns false for empty path', () => {
      expect(isValidSchemaPath(MOCK_OUTPUT_SCHEMA, [])).toBe(false);
    });

    it('returns false for null/undefined schema', () => {
      expect(isValidSchemaPath(null as unknown as JSONSchema7, ['path'])).toBe(false);
      expect(isValidSchemaPath(undefined as unknown as JSONSchema7, ['path'])).toBe(false);
    });

    it('returns false when traversing non-object property', () => {
      expect(isValidSchemaPath(MOCK_OUTPUT_SCHEMA, ['final_answer', 'invalid'])).toBe(false);
    });
  });

  describe('getSchemaPathDescription', () => {
    it('returns description for valid top-level path', () => {
      const description = getSchemaPathDescription(MOCK_OUTPUT_SCHEMA, ['final_answer']);

      expect(description).toBe("The agent's final response");
    });

    it('returns description for valid nested path', () => {
      const description = getSchemaPathDescription(MOCK_OUTPUT_SCHEMA, ['nested', 'value']);

      expect(description).toBe('A nested numeric value');
    });

    it('returns description for deeply nested path', () => {
      const description = getSchemaPathDescription(MOCK_OUTPUT_SCHEMA, ['nested', 'deep', 'data']);

      expect(description).toBe('Deeply nested data');
    });

    it('returns null for invalid path', () => {
      const description = getSchemaPathDescription(MOCK_OUTPUT_SCHEMA, ['nonexistent']);

      expect(description).toBeNull();
    });

    it('returns null for path without description', () => {
      const schemaWithoutDesc: JSONSchema7 = {
        type: 'object',
        properties: {
          field: { type: 'string' },
        },
      };
      const description = getSchemaPathDescription(schemaWithoutDesc, ['field']);

      expect(description).toBeNull();
    });

    it('returns null for empty path', () => {
      expect(getSchemaPathDescription(MOCK_OUTPUT_SCHEMA, [])).toBeNull();
    });

    it('returns null for null/undefined schema', () => {
      expect(getSchemaPathDescription(null as unknown as JSONSchema7, ['path'])).toBeNull();
      expect(getSchemaPathDescription(undefined as unknown as JSONSchema7, ['path'])).toBeNull();
    });
  });
});
