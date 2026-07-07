import { RpcMessageDefinition } from '@gitlab-org/rpc';
import { createMetadataKey, getMetadata, setMetadata } from './store';

const ENDPOINT_METADATA = createMetadataKey<RpcMessageDefinition>('endpoint');

export function setEndpointMetadata(target: object, metadata: RpcMessageDefinition): void {
  setMetadata(target, ENDPOINT_METADATA, metadata);
}

export function getEndpointMetadata(target: object): RpcMessageDefinition | undefined {
  return getMetadata(target, ENDPOINT_METADATA);
}
