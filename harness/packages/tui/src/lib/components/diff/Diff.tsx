import React from 'react';
import { Box, Text } from 'ink';
import { useTheme } from '../../theme';
import { DIFF_COLORS } from './colors';
import { parsePatchToDiffLines } from './parse_patch';
import { DiffLineContent } from './DiffLineContent';

export interface DiffProps {
  patch: string;
  oldFilepath: string;
  newFilepath: string;
  containerChromeWidth?: number;
}

export const Diff: React.FC<DiffProps> = ({
  patch,
  oldFilepath,
  newFilepath,
  containerChromeWidth = 0,
}) => {
  const theme = useTheme();
  const colors = DIFF_COLORS[theme];
  const isRenamed = oldFilepath !== newFilepath;

  const diffLines = React.useMemo(() => {
    if (!patch || patch.trim() === '') return null;
    return parsePatchToDiffLines(patch);
  }, [patch]);

  if (diffLines === null) {
    if (isRenamed) {
      return (
        <Box flexDirection="column" backgroundColor={colors.linePlainBg}>
          <Text dimColor>
            Renamed: {oldFilepath} → {newFilepath}
          </Text>
        </Box>
      );
    }
    return (
      <Box flexDirection="column" backgroundColor={colors.linePlainBg}>
        <Text dimColor>Diff: {oldFilepath}</Text>
        <Text>Files content is identical</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" backgroundColor={colors.linePlainBg}>
      {isRenamed && (
        <Text dimColor>
          Renamed: {oldFilepath} → {newFilepath}
        </Text>
      )}
      {diffLines.map((line, index) => (
        <DiffLineContent key={index} line={line} containerChromeWidth={containerChromeWidth} />
      ))}
    </Box>
  );
};
