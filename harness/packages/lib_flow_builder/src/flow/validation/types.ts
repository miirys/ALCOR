import type { EdgeId, NodeId } from '../types';

/**
 * Suggestion attached to a validation issue. Drives quick-fix buttons in
 * the UI (Issues drawer, toast rows).
 */
export interface ValidationSuggestion {
  label: string;
  action: 'open-picker' | 'open-node' | 'remove-binding';
  payload?: unknown;
}

/**
 * Unified validation issue model used across the flow builder.
 *
 * One type, three sources: schema validation (Zod), semantic validation
 * (entry-point/router/cycle checks), and binding validation (parameter
 * completeness). The same shape lets per-node badges, the action bar
 * status pill, the toast, and the Issues drawer all read from one list,
 * regardless of whether the issue was caught client-side or server-side.
 *
 * - `code` is the stable identifier for the rule (e.g. `'flow.empty'`).
 *   UI may swap copy without churning the validator.
 * - `message` is the human-readable string, terminal punctuation, no path
 *   prefix.
 * - `nodeId` / `edgeId` / `fieldPath` route the issue to the right place
 *   in the editor; absence means the issue is flow-level.
 * - `details` carries supplementary diagnostic text (e.g. the raw runtime
 *   error message behind a wrapped failure). Never a stack trace. The UI
 *   renders it as collapsible sub-text below `message`.
 */
export interface FlowValidationIssue {
  severity: 'error' | 'warning';
  code: string;
  message: string;
  nodeId?: NodeId;
  edgeId?: EdgeId;
  fieldPath?: string;
  details?: string;
  suggestion?: ValidationSuggestion;
}
