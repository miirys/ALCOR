import { createInterfaceId } from '@gitlab/needle';
import { RpcMessageDefinition } from './types';

/**
 * RpcMessageDefinitionSource represents a modular source of RPC message definitions.
 * These sources can exist in various parts of the codebase, each contributing
 * specific message definitions based on their domain or functionality.
 *
 * This modular approach allows for flexibility and scalability when adding new
 * message definitions, as each source can be developed and maintained independently.
 */
export interface RpcMessageDefinitionSource<
  TMessageDefinition extends RpcMessageDefinition = RpcMessageDefinition,
> {
  getMessageDefinitions(): TMessageDefinition[];
}

/**
 * Represents a source of server-to-client RPC message definitions.
 * Multiple sources can be implemented to contribute various message definitions
 * that are sent from the server to the client.
 */
export const ServerToClientRpcMessageDefinitionSource =
  createInterfaceId<RpcMessageDefinitionSource>('ServerToClientMessageDefinitionProvider');

/**
 * Represents a source of client-to-server RPC message definitions.
 * Multiple sources can be implemented to contribute various message definitions
 * that are sent from the client to the server.
 */
export const ClientToServerRpcMessageDefinitionSource =
  createInterfaceId<RpcMessageDefinitionSource>('ClientToServerMessageDefinitionProvider');
