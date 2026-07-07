import { type AIContextItem } from '@gitlab-org/ai-context';
import { RunWorkflowPayload, WorkflowStreamEvent } from '@gitlab-lsp/workflow-api';

export type RunWorkflowOptions = {
  workspaceFolderPath: string;
  workspaceFolderUri: string;
  workflowId: string;
  additionalContext: AIContextItem[];
} & RunWorkflowPayload;

export interface Executor {
  runWorkflow(opts: RunWorkflowOptions): AsyncGenerator<WorkflowStreamEvent, void, unknown>;
  stopWorkflow: () => void;
  interruptRunningCommand: () => void;
  isCommandRunning: () => boolean;
}
