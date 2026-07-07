import React from 'react';
import { Box, Text } from 'ink';

const LINE_NUM_WIDTH = 3;
// | space + old_num + space + new_num + space + prefix_char + space |
export const PREFIX_WIDTH = LINE_NUM_WIDTH * 2 + 1 + 1 + 1 + 2;

interface DiffLinePrefixProps {
  oldLineNum?: number;
  newLineNum?: number;
  backgroundColor: string;
  color?: string;
  diffPrefix?: string;
}

export const DiffLinePrefix: React.FC<DiffLinePrefixProps> = ({
  oldLineNum,
  newLineNum,
  backgroundColor,
  color,
  diffPrefix = ' ',
}) => {
  const oldNum =
    oldLineNum !== undefined
      ? String(oldLineNum).padStart(LINE_NUM_WIDTH)
      : ' '.repeat(LINE_NUM_WIDTH);

  const newNum =
    newLineNum !== undefined
      ? String(newLineNum).padStart(LINE_NUM_WIDTH)
      : ' '.repeat(LINE_NUM_WIDTH);

  return (
    <Box width={PREFIX_WIDTH} backgroundColor={backgroundColor}>
      <Text color={color} dimColor={!color}>
        {' '}
        {oldNum} {newNum} {diffPrefix}{' '}
      </Text>
    </Box>
  );
};
