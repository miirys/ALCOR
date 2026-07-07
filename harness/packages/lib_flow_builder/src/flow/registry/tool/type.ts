import { createInterfaceId } from '@gitlab/needle';
import type { JSONSchema7 } from 'json-schema';

export interface ToolDefinition {
  name: string;
  label: string;
  description: string;
  category: string;
  inputSchema?: JSONSchema7;
  outputSchema?: JSONSchema7;
}

export interface ToolProvider {
  get(name: string): ToolDefinition | undefined;
  getAll(): ToolDefinition[];
}

export const ToolProvider = createInterfaceId<ToolProvider>('ToolProvider');
