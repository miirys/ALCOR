import React from 'react';
import { Box, Text } from 'ink';
import { DEFAULT_TERMINAL_WIDTH } from '../../constants';
import { BaseTool, toolContentWidth } from './BaseTool';
import type { ToolComponentProps, FindFilesInput } from './types';

export const FindFilesTool: React.FC<ToolComponentProps<FindFilesInput>> = ({
  input,
  state,
  expanded,
  columns = DEFAULT_TERMINAL_WIDTH,
}) => {
  const label = `\\* Find files ${input.pattern}`;

  const output = state.type === 'success' ? state.output.trim() : null;
  const outputLines = output ? output.split('\n').filter(Boolean) : [];
  const firstLine = outputLines.at(0) ?? '';
  const hasFiles = outputLines.length > 0 && !firstLine.includes('No matches');
  const fileCount = hasFiles ? outputLines.length : 0;

  const fileWord = fileCount === 1 ? 'file' : 'files';
  const summary = hasFiles ? `${fileCount} ${fileWord} found.` : 'No files found.';
  const contentWidth = toolContentWidth(columns);

  return (
    <BaseTool
      label={label}
      state={state}
      expanded={expanded}
      columns={columns}
      showExpandHint={hasFiles}
    >
      {state.type === 'success' && (
        <Box flexDirection="column" paddingLeft={2} width={contentWidth}>
          {expanded && hasFiles ? <Text>{output}</Text> : <Text dimColor>{summary}</Text>}
        </Box>
      )}
    </BaseTool>
  );
};
