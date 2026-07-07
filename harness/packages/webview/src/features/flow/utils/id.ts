import { v4 } from 'uuid';
import { EdgeId, NodeId } from '../types';

export function generateNodeId(): NodeId {
  return v4().replace(/-/g, '') as NodeId;
}

export function generateEdgeId(): EdgeId {
  return v4().replace(/-/g, '') as EdgeId;
}
