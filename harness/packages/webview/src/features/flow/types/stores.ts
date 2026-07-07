import type { Node, Edge } from '.';

export interface MutationResult {
  success: boolean;
  errors?: string[];
}

// ═══════════════════════════════════════════════════════════════════
// UI Store Types
// ═══════════════════════════════════════════════════════════════════

export type FlowSelection =
  | { type: 'start' }
  | { type: 'node'; element: Node }
  | { type: 'edge'; element: Edge }
  | null;

// ═══════════════════════════════════════════════════════════════════
// Persistence Store Types
// ═══════════════════════════════════════════════════════════════════
