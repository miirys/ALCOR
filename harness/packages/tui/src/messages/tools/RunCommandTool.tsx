import React from 'react';
import { Box, Text } from 'ink';
import { DEFAULT_TERMINAL_WIDTH } from '../../constants';
import { BaseTool, toolContentWidth } from './BaseTool';
import { truncate, isTruncatable } from './truncate';
import type { ToolComponentProps, RunCommandInput, ShellCommandInput } from './types';

type Props = ToolComponentProps<RunCommandInput | ShellCommandInput>;

export const RunCommandTool: React.FC<Props> = ({
  input,
  state,
  expanded,
  columns = DEFAULT_TERMINAL_WIDTH,
}) => {
  const label = `❯_ Shell`;
  // The command itself can be huge (heredocs, multi-line scripts) — preview it
  // truncated like the output so a single card can never flood the frame.
  const displayCommand = expanded ? input.command : truncate(input.command);
  const commandTruncatable = isTruncatable(input.command);

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
      showExpandHint={outputTruncatable || commandTruncatable}
    >
      <Box flexDirection="column" width={contentWidth}>
        <Text color="#9db4c0" wrap="truncate-end">
          $ {displayCommand}
        </Text>
        {!expanded && commandTruncatable && <Text dimColor>… (Ctrl+O expands)</Text>}
      </Box>
      {showOutput && (
        <Box flexDirection="column" paddingLeft={2} width={contentWidth}>
          <Text>{displayOutput}</Text>
          {!expanded && outputTruncatable && <Text dimColor>(truncated)</Text>}
        </Box>
      )}
    </BaseTool>
  );
};
