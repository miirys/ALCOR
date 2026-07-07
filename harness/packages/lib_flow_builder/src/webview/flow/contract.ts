import type { WebviewId, CreateWebviewMessages } from '@gitlab-org/webview-plugin';
import type {
  CatalogFlowPage,
  CatalogFlowSummary,
  Flow,
  FlowValidationIssue,
  NodeTypeDefinition,
  RuntimeProvidedVariableDefinition,
  ToolDefinition,
} from '../../flow';

export const FLOW_BUILDER_WEBVIEW_ID = 'root/flow' as WebviewId<FlowBuilderMessages>;

// ===== Execution Types =====

/**
 * Context required to execute a workflow
 */
export interface ExecutionContext {
  /** Project path (e.g., 'gitlab-org/gitlab') */
  projectPath: string;
  /** Namespace path for billing/permissions */
  namespacePath: string;
  /** Whether the API is configured and ready */
  isReady: boolean;
}

/**
 * Parameters for starting flow execution
 */
export interface ExecuteFlowParams {
  /** URI of the saved flow to execute */
  uri: string;
  /**
   * Context inputs for the flow execution.
   * Keys are variable names (e.g., "goal", "project_id")
   * Values are the user-provided strings
   */
  context: Record<string, string>;
}

/**
 * Coarse role tier inferred from `Project.userPermissions`. Used to give a
 * one-glance answer to "do I have write access to the loaded project?"
 * without trying to mirror GitLab's full role taxonomy.
 *
 * - `owner`     — Owner / can remove the project
 * - `maintainer` — Maintainer / can admin the project
 * - `developer` — Developer / can push code
 * - `reader`    — Project is visible but no push rights (Reporter/Guest)
 * - `unknown`   — Permissions could not be resolved
 */
export type SessionProjectRole = 'owner' | 'maintainer' | 'developer' | 'reader' | 'unknown';

export interface SessionUser {
  id: string;
  username: string;
  name: string;
  avatarUrl: string;
}

export interface SessionProject {
  path: string;
  id: string | null;
  namespacePath: string;
  role: SessionProjectRole;
  /**
   * Catalog-specific permissions, sourced from `Project.userPermissions`'s
   * AI Catalog fields. `null` when the server didn't expose the field
   * (older instance) or the probe failed — treat as "unknown, don't gate
   * the UI" rather than "denied."
   */
  canCreateCatalogItem: boolean | null;
  canReadCatalogItem: boolean | null;
}

/**
 * Snapshot of the active LSP session — surfaced to the canvas so the user
 * can confirm at a glance which project the flow targets and as which
 * GitLab user. Either field may be null if resolution failed.
 */
export interface SessionInfo {
  user: SessionUser | null;
  project: SessionProject | null;
}

/**
 * Workflow status during execution
 */
export type WorkflowStatus =
  | 'CREATED'
  | 'RUNNING'
  | 'FINISHED'
  | 'FAILED'
  | 'STOPPED'
  | 'INPUT_REQUIRED'
  | 'PLAN_APPROVAL_REQUIRED'
  | 'TOOL_CALL_APPROVAL_REQUIRED';

/**
 * Event streamed during workflow execution
 */
export interface ExecutionEvent {
  /** Current checkpoint description */
  checkpoint: string;
  /** Any errors encountered */
  errors: string[];
  /** The workflow goal */
  workflowGoal: string;
  /** Current workflow status */
  workflowStatus: WorkflowStatus;
}

// Re-export only the visual types the frontend needs
export type {
  FlowId,
  Flow,
  Node,
  Edge,
  NodeId,
  EdgeId,
  Position,
  NodeTypeDefinition,
  ToolDefinition,
  NodeInput,
  AgentNodeConfig,
  AiTaskNodeConfig,
  ToolNodeConfig,
  NodeConfig,
  InlinePromptDefinition,
  FlowInputField,
  BindingKind,
  BindingStatus,
  ParameterBinding,
  RuntimeProvidedVariableDefinition,
  CatalogFlowSummary,
  CatalogFlowPage,
  FlowValidationIssue,
  ValidationSuggestion,
} from '../../flow';
export { FlowValidationCode } from '../../flow/validation/codes';

/**
 * Parameters for listing catalog flows. Pagination is cursor-based; pass the
 * previous response's `pageInfo.endCursor` as `after` to fetch the next page.
 */
export interface ListCatalogFlowsParams {
  search?: string;
  first?: number;
  after?: string;
}

/**
 * Parameters for creating a new catalog flow.
 *
 * The backend resolves the target project from the active workspace; the
 * frontend never deals with project IDs directly.
 */
export interface CreateCatalogFlowParams {
  name: string;
  description: string;
  public: boolean;
  flow: Flow;
}

/**
 * Flow Builder Message Contract
 */
export type FlowBuilderMessages = CreateWebviewMessages<{
  // Frontend → Backend
  fromWebview: {
    notifications: {
      /** Notify backend that webview is ready */
      appReady: undefined;
    };

    requests: {
      /** Load the flow (v1: single flow only) */
      loadFlow: {
        params: {
          uri: string;
        };
        result: Flow | null;
      };

      /**
       * Save the flow.
       *
       * On failure, returns the unified `FlowValidationIssue[]` shape so the
       * webview can render structured issues — node-routed where available,
       * otherwise flat — through the same UI surfaces used for client-side
       * validation.
       */
      saveFlow: {
        params: { uri: string; flow: Flow };
        result: { success: true } | { success: false; issues: FlowValidationIssue[] };
      };

      /** Get all available node type definitions */
      getNodeTypeDefinitions: {
        params: undefined;
        result: NodeTypeDefinition[];
      };

      /** Get all available tool definitions */
      getToolDefinitions: {
        params: undefined;
        result: ToolDefinition[];
      };

      /** Get execution context (project info, API readiness) */
      getExecutionContext: {
        params: undefined;
        result: ExecutionContext;
      };

      /** Get session-level info (current user + project + role) for indicators */
      getSessionInfo: {
        params: undefined;
        result: SessionInfo;
      };

      /** Execute the saved flow with context inputs */
      executeFlow: {
        params: ExecuteFlowParams;
        result: { success: true; executionId: string } | { success: false; error: string };
      };

      /** Cancel an active execution */
      cancelExecution: {
        params: { executionId: string };
        result: { success: boolean };
      };

      /** List catalog flows visible to the current user, paginated. */
      listCatalogFlows: {
        params: ListCatalogFlowsParams;
        result:
          | { success: true; page: CatalogFlowPage }
          | { success: false; error: string; details?: string[] };
      };

      /**
       * Create a new catalog flow seeded with the provided flow.
       *
       * Returns the opaque catalog URI to use for subsequent loads/saves.
       */
      createCatalogFlow: {
        params: CreateCatalogFlowParams;
        result:
          | { success: true; uri: string; summary: CatalogFlowSummary }
          | { success: false; error: string; details?: string[] };
      };
    };
  };

  // Backend → Frontend
  toWebview: {
    notifications: {
      /** Flow loaded successfully */
      flowLoaded: {
        flow: Flow;
      };

      /** Flow saved successfully */
      flowSaved: {
        timestamp: Date;
      };

      /** Flow changed externally (e.g., file watcher detected change) */
      flowChanged: {
        flow: Flow;
      };

      /** Validation or persistence error occurred */
      error: {
        operation: 'load' | 'save' | 'validate';
        message: string;
        details?: string[];
      };

      /** Initial state when webview connects */
      initialState: {
        nodeTypeDefinitions: NodeTypeDefinition[];
        toolDefinitions: ToolDefinition[];
        runtimeProvidedVariableDefinitions: RuntimeProvidedVariableDefinition[];
      };

      /** Workflow execution has started */
      executionStarted: {
        executionId: string;
        context: Record<string, string>;
      };

      /** Workflow execution update (checkpoint reached) */
      executionUpdate: {
        executionId: string;
        event: ExecutionEvent;
      };

      /** Workflow execution completed (success, failure, or stopped) */
      executionCompleted: {
        executionId: string;
        status: 'completed' | 'failed' | 'stopped';
        finalCheckpoint?: string;
        error?: string;
      };
    };

    requests: {};
  };
}>;
