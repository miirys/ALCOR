// Tool input formatting types for UI display
// The `tool` discriminant enables type-safe routing in the TUI

export interface FileWithContent {
  filepath: string;
  content: string;
}

export interface TodoItem {
  description: string;
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled';
}

export type ToolInputDisplay =
  | { tool: 'read_file'; filepath: string; offset?: number; limit?: number }
  | { tool: 'read_files'; filepaths: string[] }
  | { tool: 'edit_file'; filepath: string; diff: { old: FileWithContent; new: FileWithContent } }
  | { tool: 'create_file_with_contents'; filepath: string; content: string }
  | { tool: 'run_command'; command: string }
  | { tool: 'shell_command'; command: string }
  | { tool: 'list_dir'; directory: string }
  | { tool: 'find_files'; pattern: string }
  | { tool: 'grep'; pattern: string; directory?: string; caseInsensitive?: boolean }
  | { tool: 'mkdir'; path: string }
  | { tool: 'run_git_command'; command: string; commandArgs?: string }
  | { tool: 'todo_write'; todos: TodoItem[] }
  | { tool: 'compaction'; trigger: string; wasCompacted: boolean }
  | { tool: 'mcp_tool'; serverName: string; name: string; args: Record<string, unknown> }
  | { tool: 'generic'; name: string; args: Record<string, unknown> };
