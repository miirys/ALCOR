import React from 'react';
import { Box, Text } from 'ink';
import { DEFAULT_TERMINAL_WIDTH } from '../../constants';
import { BaseTool, toolContentWidth } from './BaseTool';
import { truncate, isTruncatable, truncateToWidth, formatJsonOutput } from './truncate';
import type { ToolComponentProps, McpToolInput } from './types';

export const McpTool: React.FC<ToolComponentProps<McpToolInput>> = ({
  input,
  state,
  expanded,
  columns = DEFAULT_TERMINAL_WIDTH,
}) => {
  const label = `\`${input.name}\` [${input.serverName}]`;
  const contentWidth = toolContentWidth(columns);

  const hasArgs = Object.keys(input.args).length > 0;
  const compactArgs = JSON.stringify(input.args);
  const prettyArgs = JSON.stringify(input.args, null, 2);
  // The args/output boxes add paddingLeft={2}, so the usable width is 2 less.
  const argsWidth = Math.max(1, contentWidth - 2);
  const displayArgs = expanded ? prettyArgs : truncateToWidth(compactArgs, argsWidth);
  const argsTruncated = !expanded && displayArgs !== compactArgs;

  const output = state.type === 'success' ? state.output.trim() : null;
  const formattedOutput = output != null ? formatJsonOutput(output) : null;
  const showOutput = formattedOutput != null && formattedOutput.length > 0;
  const displayOutput = expanded ? formattedOutput : truncate(formattedOutput ?? '');
  const outputTruncatable = formattedOutput ? isTruncatable(formattedOutput) : false;

  const showExpandHint = argsTruncated || outputTruncatable;

  return (
    <BaseTool
      label={label}
      state={state}
      expanded={expanded}
      columns={columns}
      showExpandHint={showExpandHint}
    >
      {hasArgs && (
        <Box flexDirection="column" paddingLeft={2} width={contentWidth}>
          <Text dimColor>{displayArgs}</Text>
        </Box>
      )}

      {showOutput && (
        <Box flexDirection="column" paddingLeft={2} width={contentWidth}>
          <Text>{displayOutput}</Text>
          {!expanded && outputTruncatable && <Text dimColor>(truncated)</Text>}
        </Box>
      )}
    </BaseTool>
  );
};
