// packages/lib_ai_configuration/src/flow/persistence/flow_store.ts
import { ResultAsync } from 'neverthrow';
import { createInterfaceId } from '@gitlab/needle';
import type { Flow, FlowId } from '../types';
import type { FlowValidationIssue } from '../validation';

/**
 * Persistence errors
 *
 * `validation_error` carries the unified `FlowValidationIssue[]` shape so
 * structured issues flow from the source (resolver / GraphQL) to the wire
 * without remapping. Other variants are persistence-specific concerns
 * (missing file, IO failure, malformed YAML) — kept as flat strings since
 * they don't have node-level routing to surface anyway.
 */
export type FlowStoreError =
  | { type: 'not_found'; flowId: FlowId }
  | { type: 'invalid_format'; message: string; details?: string[] }
  | { type: 'io_error'; message: string }
  | { type: 'validation_error'; issues: FlowValidationIssue[] };

/**
 * Abstract interface for flow persistence
 *
 * Implementations handle format conversion (e.g., YAML) internally
 */
export interface FlowStore {
  /**
   * Initialize the store (create directories, etc.)
   */
  initialize(): ResultAsync<void, FlowStoreError>;

  /**
   * Load a flow from a specific URI
   * Supported schemes:
   * - file:// - Absolute file system path
   * - flow:// - Internal registry path (e.g. flow://default)
   */
  loadFlow(uri: string): ResultAsync<Flow, FlowStoreError>;

  /**
   * Load raw YAML content from a specific URI
   * Used for workflow execution where the raw YAML is needed
   */
  loadFlowYaml(uri: string): ResultAsync<string, FlowStoreError>;

  /**
   * Save a flow to a specific URI
   */
  saveFlow(flow: Flow, uri: string): ResultAsync<void, FlowStoreError>;

  /**
   * List all available flows
   *
   * For v1: returns single flow or empty array
   */
  listFlows(): ResultAsync<Flow[], FlowStoreError>;

  /**
   * Watch for external changes
   *
   * Future: use for file watcher integration
   */
  // onFlowChanged(callback: (flow: Flow) => void): Disposable;
}

export const FlowStore = createInterfaceId<FlowStore>('FlowStore');
