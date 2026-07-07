import { createInterfaceId } from '@gitlab/needle';
import { HttpResponse, PlainTextResponse } from '@gitlab-org/duo-workflow-service';
import { ToolInputDisplay } from '@gitlab-lsp/workflow-api';
import { GenerateTokenResponse } from '../../../api/types';
import { WorkflowAction } from '../clients/types';
import { FileStateTracker } from './file_state_tracker';

export type { PlainTextResponse } from '@gitlab-org/duo-workflow-service';

export type WorkflowActionOf<
  K extends keyof WorkflowAction,
  V = NonNullable<WorkflowAction[K]>,
> = WorkflowAction & Record<K, V>;

export interface WorkflowActionContext {
  workspaceFolderPath: string;
  /**
   * The original workspace folder URI string (e.g. `file:///home/user/project`,
   * `adt://server/sap/bc/adt/packages/zmy_package`, `semanticfs://...`).
   * Use this to construct proper file URIs for virtual filesystem workspaces
   * instead of assuming `file://` scheme.
   */
  workspaceFolderUri: string;
  workflowToken: GenerateTokenResponse;
  workflowId: string;
  fileStateTracker: FileStateTracker;
  abortSignal: AbortSignal;
}

export interface ToolInputFormatContext {
  workspaceFolderPath: string;
  workspaceFolderUri?: string;
  toolName: string;
}

export interface WorkflowActionHandler<T extends WorkflowAction = WorkflowAction> {
  name: string;
  supportsVirtualWorkspace?: boolean;
  canHandle(action: WorkflowAction): action is T;
  execute(action: T, context: WorkflowActionContext): Promise<HttpResponse | PlainTextResponse>;
}

export const WorkflowActionHandler =
  createInterfaceId<WorkflowActionHandler>('WorkflowActionHandler');

/**
 * Maps a tool's raw protocol args to a {@link ToolInputDisplay}. This is a
 * display concern, decoupled from tool execution ({@link WorkflowActionHandler}).
 */
export interface ToolInputFormatter {
  /** The exact tool name this formatter handles (used for direct lookup). */
  toolName: string;
  /**
   * Optional predicate for formatters that match a family of tool names rather
   * than an exact one (e.g. namespaced MCP tools).
   */
  matches?(toolName: string): boolean;
  /**
   * Maps the raw, untrusted snake_case args to a {@link ToolInputDisplay}. The
   * args are server-originating and may be missing, partial, or wrong-typed, so
   * implementations must validate them (parse with a Zod schema) and **throw**
   * on invalid input. The dispatcher catches the throw and falls back to the
   * generic display — never let an unvalidated value reach the TUI.
   */
  format(
    args: unknown,
    context: ToolInputFormatContext,
  ): ToolInputDisplay | Promise<ToolInputDisplay>;
}

export const ToolInputFormatter = createInterfaceId<ToolInputFormatter>('ToolInputFormatter');
