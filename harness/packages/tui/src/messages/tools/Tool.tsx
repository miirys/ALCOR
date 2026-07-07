import React from 'react';
import { Box } from 'ink';
import type { ToolCall } from '../../types';
import { ReadFileTool } from './ReadFileTool';
import { ReadFilesTool } from './ReadFilesTool';
import { EditFileTool } from './EditFileTool';
import { CreateFileTool } from './CreateFileTool';
import { RunCommandTool } from './RunCommandTool';
import { ListDirTool } from './ListDirTool';
import { FindFilesTool } from './FindFilesTool';
import { GrepTool } from './GrepTool';
import { MkdirTool } from './MkdirTool';
import { GitCommandTool } from './GitCommandTool';
import { TodoWriteTool } from './TodoWriteTool';
import { CompactionTool } from './CompactionTool';
import { McpTool } from './McpTool';
import { GenericTool } from './GenericTool';

interface ToolProps {
  tool: ToolCall;
  expanded: boolean;
  columns?: number;
}

export const Tool: React.FC<ToolProps> = ({ tool, expanded, columns }) => {
  const { input, state } = tool;
  const props = { state, expanded, columns };

  const renderTool = () => {
    switch (input.tool) {
      case 'read_file':
        return <ReadFileTool input={input} {...props} />;

      case 'read_files':
        return <ReadFilesTool input={input} {...props} />;

      case 'edit_file':
        return <EditFileTool input={input} {...props} />;

      case 'create_file_with_contents':
        return <CreateFileTool input={input} {...props} />;

      case 'run_command':
      case 'shell_command':
        return <RunCommandTool input={input} {...props} />;

      case 'list_dir':
        return <ListDirTool input={input} {...props} />;

      case 'find_files':
        return <FindFilesTool input={input} {...props} />;

      case 'grep':
        return <GrepTool input={input} {...props} />;

      case 'mkdir':
        return <MkdirTool input={input} {...props} />;

      case 'run_git_command':
        return <GitCommandTool input={input} {...props} />;

      case 'todo_write':
        return <TodoWriteTool input={input} {...props} />;

      case 'compaction':
        return <CompactionTool input={input} {...props} />;

      case 'mcp_tool':
        return <McpTool input={input} {...props} />;

      case 'generic':
      default:
        return <GenericTool input={input} {...props} />;
    }
  };

  return (
    <Box flexDirection="column" marginY={0}>
      {renderTool()}
    </Box>
  );
};
