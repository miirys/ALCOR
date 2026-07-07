import React from 'react';
import { Box, Text } from 'ink';
import { DEFAULT_TERMINAL_WIDTH } from '../../constants';
import { BaseTool, toolContentWidth } from './BaseTool';
import { truncate, isTruncatable } from './truncate';
import type { ToolComponentProps, GitCommandInput } from './types';

export const GitCommandTool: React.FC<ToolComponentProps<GitCommandInput>> = ({
  input,
  state,
  expanded,
  columns = DEFAULT_TERMINAL_WIDTH,
}) => {
  const label = input.commandArgs
    ? `⎇ git ${input.command} ${input.commandArgs}`
    : `⎇ git ${input.command}`;

  const output = state.type === 'success' ? state.output.trim() : null;
  const showOutput = output && output.length > 0;
  const displayOutput = expanded ? output : truncate(output ?? '');
  const outputTruncatable = output ? isTruncatable(output) : false;
  const contentWidth = toolContentWidth(columns);

  return (
    <BaseTool
      label={label}
      state={state}
      expanded={expanded}
      columns={columns}
      showExpandHint={outputTruncatable}
    >
      {showOutput && (
        <Box flexDirection="column" paddingLeft={2} width={contentWidth}>
          <Text>{displayOutput}</Text>
          {!expanded && outputTruncatable && <Text dimColor>(truncated)</Text>}
        </Box>
      )}
    </BaseTool>
  );
};
