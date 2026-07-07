import { RpcMessageDefinition } from '@gitlab-org/rpc';

export const createTestMessage = (methodName: string): RpcMessageDefinition =>
  ({
    methodName,
  }) as RpcMessageDefinition;

export const createTestMessages = (methodNames: string[]): RpcMessageDefinition[] =>
  methodNames.map(createTestMessage);
