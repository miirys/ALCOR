import React from 'react';
import { Box, Text } from 'ink';
import { DEFAULT_TERMINAL_WIDTH } from '../../constants';
import { BaseTool, toolContentWidth } from './BaseTool';
import type { ToolComponentProps, ReadFilesInput } from './types';

export const ReadFilesTool: React.FC<ToolComponentProps<ReadFilesInput>> = ({
  input,
  state,
  expanded,
  columns = DEFAULT_TERMINAL_WIDTH,
}) => {
  const count = input.filepaths.length;

  let label = `→ Read ${count} files`;
  if (count === 1) {
    label = `→ Read ${input.filepaths.at(0)}`;
  }
  const showFilesList = count > 1;
  const contentWidth = toolContentWidth(columns);

  return (
    <BaseTool label={label} state={state} expanded={expanded} columns={columns}>
      {showFilesList && (
        <Box flexDirection="column" paddingLeft={2} width={contentWidth}>
          {input.filepaths.map((filePath) => (
            <Text key={filePath} dimColor>
              ↳ {filePath}
            </Text>
          ))}
        </Box>
      )}
    </BaseTool>
  );
};
