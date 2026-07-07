import type { ToolInput, ToolCall } from '../../types';

export type ToolState = ToolCall['state'];

// Extract specific input type from the union
export type ReadFileInput = Extract<ToolInput, { tool: 'read_file' }>;
export type ReadFilesInput = Extract<ToolInput, { tool: 'read_files' }>;
export type EditFileInput = Extract<ToolInput, { tool: 'edit_file' }>;
export type CreateFileInput = Extract<ToolInput, { tool: 'create_file_with_contents' }>;
export type RunCommandInput = Extract<ToolInput, { tool: 'run_command' }>;
export type ShellCommandInput = Extract<ToolInput, { tool: 'shell_command' }>;
export type ListDirInput = Extract<ToolInput, { tool: 'list_dir' }>;
export type FindFilesInput = Extract<ToolInput, { tool: 'find_files' }>;
export type GrepInput = Extract<ToolInput, { tool: 'grep' }>;
export type MkdirInput = Extract<ToolInput, { tool: 'mkdir' }>;
export type GitCommandInput = Extract<ToolInput, { tool: 'run_git_command' }>;
export type TodoWriteInput = Extract<ToolInput, { tool: 'todo_write' }>;
export type CompactionInput = Extract<ToolInput, { tool: 'compaction' }>;
export type McpToolInput = Extract<ToolInput, { tool: 'mcp_tool' }>;
export type GenericInput = Extract<ToolInput, { tool: 'generic' }>;

// Props for tool-specific components
export interface ToolComponentProps<T extends ToolInput> {
  input: T;
  state: ToolState;
  expanded: boolean;
  columns?: number;
}
