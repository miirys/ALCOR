import { createInterfaceId } from '@gitlab/needle';

export interface RuntimeProvidedVariableDefinition {
  /** Dotted path within state.context, e.g. 'goal' or 'inputs.os_information' */
  key: string;
  label: string;
  description: string;
  type: 'string' | 'integer' | 'number' | 'boolean' | 'object' | 'array';
  /** 'always' = set unconditionally by runtime; 'conditional' = only when executor provides it */
  availability: 'always' | 'conditional';
}

export interface RuntimeProvidedVariableProvider {
  getAll(): RuntimeProvidedVariableDefinition[];
}

export const RuntimeProvidedVariableProvider = createInterfaceId<RuntimeProvidedVariableProvider>(
  'RuntimeProvidedVariableProvider',
);
