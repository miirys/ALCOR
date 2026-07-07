import type { JSONSchema7 } from 'json-schema';
import type { Node, NodeTypeDefinition } from '../types';

export function getNodeOutputSchema(
  node: Node,
  definitions: NodeTypeDefinition[],
): JSONSchema7 | null {
  const definition = definitions.find((d) => d.type === node.type);
  if (!definition?.outputSchema) return null;
  return definition.outputSchema;
}

export function getNodeInputSchema(
  node: Node,
  definitions: NodeTypeDefinition[],
): JSONSchema7 | null {
  const definition = definitions.find((d) => d.type === node.type);
  if (!definition?.inputSchema) return null;
  return definition.inputSchema;
}

export function getSchemaOutputPaths(schema: JSONSchema7, prefix = ''): string[] {
  const paths: string[] = [];
  if (!schema || typeof schema !== 'object') return paths;

  if (schema.type === 'object' && schema.properties) {
    const props = schema.properties as Record<string, JSONSchema7>;
    for (const [key, propSchema] of Object.entries(props)) {
      const currentPath = prefix ? `${prefix}.${key}` : key;
      paths.push(currentPath);
      if (propSchema?.type === 'object' && propSchema.properties) {
        paths.push(...getSchemaOutputPaths(propSchema, currentPath));
      }
    }
  }
  return paths;
}

export function isValidSchemaPath(schema: JSONSchema7, path: string[]): boolean {
  if (!schema || typeof schema !== 'object' || path.length === 0) return false;

  let currentSchema: JSONSchema7 | undefined = schema;
  for (const segment of path) {
    if (!currentSchema || currentSchema.type !== 'object' || !currentSchema.properties) {
      return false;
    }
    const props = currentSchema.properties as Record<string, JSONSchema7>;
    currentSchema = props[segment];
    if (!currentSchema) return false;
  }
  return true;
}

export function getSchemaPathDescription(schema: JSONSchema7, path: string[]): string | null {
  if (!schema || typeof schema !== 'object' || path.length === 0) return null;

  let currentSchema: JSONSchema7 | undefined = schema;
  for (const segment of path) {
    if (!currentSchema || currentSchema.type !== 'object' || !currentSchema.properties) {
      return null;
    }
    const props = currentSchema.properties as Record<string, JSONSchema7>;
    currentSchema = props[segment];
    if (!currentSchema) return null;
  }
  return (currentSchema as JSONSchema7).description || null;
}
