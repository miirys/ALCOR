import { createInterfaceId } from '@gitlab/needle';
import { RpcMessageDefinition } from './types';

/**
 * RpcMessageDefinitionProvider acts as an aggregator that collects message
 * definitions from various RpcMessageDefinitionSources across the codebase.
 * While multiple sources contribute specific definitions, the provider consolidates
 * them to present a comprehensive set of available messages.
 *
 * This structure ensures a centralized view of all message definitions, which
 * is useful for validation, schema generation, and documentation purposes.
 */
export interface RpcMessageDefinitionProvider<
  TMessageDefinition extends RpcMessageDefinition = RpcMessageDefinition,
> {
  getMessageDefinitions(): readonly TMessageDefinition[];
}

/**
 * Aggregates all server-to-client message definitions from various sources.
 * This provider serves as a central point to retrieve the complete set of
 * server-to-client messages used in the system.
 */
export interface ServerToClientRpcMessageDefinitionProvider<
  TMessageDefinition extends RpcMessageDefinition = RpcMessageDefinition,
> extends RpcMessageDefinitionProvider<TMessageDefinition> {}

export const ServerToClientRpcMessageDefinitionProvider =
  createInterfaceId<RpcMessageDefinitionProvider>('ServerToClientMessageDefinitionProvider');

/**
 * Aggregates all client-to-server message definitions from various sources.
 * This provider serves as a central point to retrieve the complete set of
 * client-to-server messages used in the system.
 */
export interface ClientToServerRpcMessageDefinitionProvider<
  TMessageDefinition extends RpcMessageDefinition = RpcMessageDefinition,
> extends RpcMessageDefinitionProvider<TMessageDefinition> {}

export const ClientToServerRpcMessageDefinitionProvider =
  createInterfaceId<RpcMessageDefinitionProvider>('ClientToServerMessageDefinitionProvider');
