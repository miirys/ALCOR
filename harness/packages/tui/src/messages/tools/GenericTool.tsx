import React from 'react';
import { Box, Text } from 'ink';
import { DEFAULT_TERMINAL_WIDTH } from '../../constants';
import { BaseTool, toolContentWidth } from './BaseTool';
import { truncate, isTruncatable, formatJsonOutput } from './truncate';
import type { ToolComponentProps, GenericInput } from './types';

export const GenericTool: React.FC<ToolComponentProps<GenericInput>> = ({
  input,
  state,
  expanded,
  columns = DEFAULT_TERMINAL_WIDTH,
}) => {
  const label = `\`${input.name}\``;

  const argsJson = JSON.stringify(input.args, null, 2);
  const displayArgs = expanded ? argsJson : truncate(argsJson);
  const argsTruncatable = isTruncatable(argsJson);

  const output = state.type === 'success' ? state.output.trim() : null;
  const formattedOutput = output ? formatJsonOutput(output) : null;
  let displayOutput = null;
  if (formattedOutput) {
    displayOutput = expanded ? formattedOutput : truncate(formattedOutput);
  }
  const outputTruncatable = formattedOutput ? isTruncatable(formattedOutput) : false;

  const showExpandHint = argsTruncatable || outputTruncatable;
  const contentWidth = toolContentWidth(columns);

  return (
    <BaseTool
      label={label}
      state={state}
      expanded={expanded}
      columns={columns}
      showExpandHint={showExpandHint}
    >
      <Box flexDirection="column" paddingLeft={2} width={contentWidth}>
        <Text dimColor>Input:</Text>
        <Text>{displayArgs}</Text>
        {!expanded && argsTruncatable && <Text dimColor>(truncated)</Text>}
      </Box>

      {displayOutput && (
        <Box flexDirection="column" paddingLeft={2} width={contentWidth}>
          <Text dimColor>Output:</Text>
          <Text>{displayOutput}</Text>
          {!expanded && outputTruncatable && <Text dimColor>(truncated)</Text>}
        </Box>
      )}
    </BaseTool>
  );
};
