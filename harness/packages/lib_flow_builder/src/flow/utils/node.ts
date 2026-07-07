import type { NodeId as INodeId } from '../types';

export type NodeId = INodeId;
export const NodeId = {
  create: () => globalThis.crypto.randomUUID() as NodeId,
};
