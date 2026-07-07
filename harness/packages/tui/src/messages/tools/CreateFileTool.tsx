import React from 'react';
import { Box, Text } from 'ink';
import { DEFAULT_TERMINAL_WIDTH } from '../../constants';
import { BaseTool, toolContentWidth } from './BaseTool';
import { truncate, isTruncatable } from './truncate';
import type { ToolComponentProps, CreateFileInput } from './types';

export const CreateFileTool: React.FC<ToolComponentProps<CreateFileInput>> = ({
  input,
  state,
  expanded,
  columns = DEFAULT_TERMINAL_WIDTH,
}) => {
  const label = `← Create ${input.filepath}`;
  const contentTruncatable = isTruncatable(input.content);
  const displayContent = expanded ? input.content : truncate(input.content);
  const contentWidth = toolContentWidth(columns);

  return (
    <BaseTool
      label={label}
      state={state}
      expanded={expanded}
      columns={columns}
      showExpandHint={contentTruncatable}
    >
      <Box flexDirection="column" paddingLeft={2} width={contentWidth}>
        <Text>{displayContent}</Text>
        {!expanded && contentTruncatable && <Text dimColor>(truncated)</Text>}
      </Box>
    </BaseTool>
  );
};
