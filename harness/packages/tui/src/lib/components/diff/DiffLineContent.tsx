import { Box, Text, useStdout } from 'ink';
import React from 'react';
import { useTheme } from '../../theme';
import { DIFF_COLORS } from './colors';
import type { DiffLine } from './parse_patch';
import { DiffLinePrefix, PREFIX_WIDTH } from './DiffLinePrefix';

type DiffColorKey = keyof (typeof DIFF_COLORS)['dark'];

interface LineTypeConfig {
  prefix: string;
  prefixBgKey: DiffColorKey;
  bgKey: DiffColorKey;
  dimContent?: boolean;
  hideLineNumbers?: boolean;
}

const LINE_CONFIG: Record<DiffLine['type'], LineTypeConfig> = {
  add: { prefix: '+', prefixBgKey: 'lineAddPrefixBg', bgKey: 'lineAddBg' },
  del: { prefix: '-', prefixBgKey: 'lineDelPrefixBg', bgKey: 'lineDelBg' },
  context: { prefix: ' ', prefixBgKey: 'linePlainPrefixBg', bgKey: 'linePlainBg' },
  header: {
    prefix: '',
    prefixBgKey: 'lineHunkPrefixBg',
    bgKey: 'lineHunkBg',
    dimContent: true,
    hideLineNumbers: true,
  },
};

const DEFAULT_TERMINAL_WIDTH = 80;

function wrapText(text: string, maxWidth: number): string[] {
  if (maxWidth <= 0 || text.length <= maxWidth) return [text];

  const segments: string[] = [];
  for (let i = 0; i < text.length; i += maxWidth) {
    segments.push(text.slice(i, i + maxWidth));
  }
  return segments;
}

interface DiffLineContentProps {
  line: DiffLine;
  // Columns consumed by an ancestor container's chrome (border, padding, etc.)
  // that should be subtracted from the available width. Defaults to 0 so the
  // component remains correct when rendered standalone.
  containerChromeWidth?: number;
}

export const DiffLineContent: React.FC<DiffLineContentProps> = ({
  line,
  containerChromeWidth = 0,
}) => {
  const { stdout } = useStdout();
  const availableWidth = (stdout?.columns || DEFAULT_TERMINAL_WIDTH) - containerChromeWidth;
  const theme = useTheme();
  const colors = DIFF_COLORS[theme];
  const config = LINE_CONFIG[line.type];

  const contentWidth = availableWidth - PREFIX_WIDTH;
  const segments = wrapText(line.content, contentWidth);

  return (
    <>
      {segments.map((segment, i) => (
        <Box key={i} flexDirection="row">
          {i === 0 ? (
            <DiffLinePrefix
              oldLineNum={line.oldLineNum}
              newLineNum={line.newLineNum}
              backgroundColor={colors[config.prefixBgKey]}
              color={config.hideLineNumbers ? colors[config.prefixBgKey] : undefined}
              diffPrefix={config.prefix}
            />
          ) : (
            <DiffLinePrefix backgroundColor={colors[config.prefixBgKey]} />
          )}
          <Box width={contentWidth} backgroundColor={colors[config.bgKey]}>
            <Text wrap="truncate" dimColor={config.dimContent}>
              {segment}
            </Text>
          </Box>
        </Box>
      ))}
    </>
  );
};
