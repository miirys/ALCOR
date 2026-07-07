import React from 'react';
import { Box, Text } from 'ink';
import { DEFAULT_TERMINAL_WIDTH } from '../../constants';
import { BaseTool, toolContentWidth } from './BaseTool';
import type { ToolComponentProps, GrepInput } from './types';

export const GrepTool: React.FC<ToolComponentProps<GrepInput>> = ({
  input,
  state,
  expanded,
  columns = DEFAULT_TERMINAL_WIDTH,
}) => {
  const { pattern, directory, caseInsensitive } = input;
  const caseInsensitiveSuffix = caseInsensitive ? ' (case insensitive)' : '';
  const label = `\\* Find ${pattern} in ${directory || 'files'}${caseInsensitiveSuffix}`;

  const output = state.type === 'success' ? state.output.trim() : null;
  const firstLine = output ? (output.split('\n').at(0) ?? '') : '';
  const hasMatches = firstLine.startsWith('Found ');
  const summary = hasMatches ? firstLine : 'No matches found.';
  const contentWidth = toolContentWidth(columns);

  return (
    <BaseTool
      label={label}
      state={state}
      expanded={expanded}
      columns={columns}
      showExpandHint={hasMatches}
    >
      {state.type === 'success' && (
        <Box flexDirection="column" paddingLeft={2} width={contentWidth}>
          {expanded && hasMatches ? <Text>{output}</Text> : <Text dimColor>{summary}</Text>}
        </Box>
      )}
    </BaseTool>
  );
};
