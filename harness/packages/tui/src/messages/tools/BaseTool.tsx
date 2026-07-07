import React from 'react';
import { Box, Text } from 'ink';
import { Markdown } from '../../lib/components/Markdown';
import { DEFAULT_TERMINAL_WIDTH } from '../../constants';
import type { ToolState } from './types';

// Columns consumed by BaseTool's chrome (borderLeft + paddingLeft). Children
// that need to size against the terminal width must subtract this. Keep in sync
// with the borderLeft + paddingLeft props on the outer Box below.
export const BASE_TOOL_CHROME_WIDTH = 2;

// `Math.max(1, …)` guards against terminals narrower than the chrome itself.
export const toolContentWidth = (columns: number): number =>
  Math.max(1, columns - BASE_TOOL_CHROME_WIDTH);

interface BaseToolProps {
  label: string;
  state: ToolState;
  children?: React.ReactNode;
  expanded: boolean;
  showExpandHint?: boolean;
  columns?: number;
}

// Leading state glyph, ALCOR-style: `│ ✓ ± Edit · path`.
const StateIndicator: React.FC<{ state: ToolState }> = ({ state }) => {
  switch (state.type) {
    case 'loading':
      return <Text color="#8a8a94">◐ </Text>;
    case 'error':
      return <Text color="red">✗ </Text>;
    case 'approval_request':
      return <Text color="yellow">? </Text>;
    default:
      return <Text color="green">✓ </Text>;
  }
};

export const BaseTool: React.FC<BaseToolProps> = ({
  label,
  state,
  children,
  columns = DEFAULT_TERMINAL_WIDTH,
}) => {
  const contentWidth = toolContentWidth(columns);
  return (
    <Box
      flexDirection="column"
      marginY={0}
      borderLeft
      borderRight={false}
      borderTop={false}
      borderBottom={false}
      borderStyle="bold"
      borderColor="#44444c"
      paddingLeft={1}
      width={columns}
    >
      <Box width={contentWidth}>
        {/* Reserve 2 cols for the leading state glyph so the label markdown
            doesn't push it off the right edge on narrow terminals. */}
        <StateIndicator state={state} />
        <Text dimColor>
          <Markdown markdown={label} availableWidth={Math.max(1, contentWidth - 2)} />
        </Text>
      </Box>

      {children}

      {state.type === 'approval_request' && (
        <Box width={contentWidth}>
          <Markdown markdown={state.content} availableWidth={contentWidth} />
        </Box>
      )}

      {state.type === 'error' && (
        <Box paddingLeft={2} width={contentWidth}>
          <Text color="red">{state.error}</Text>
        </Box>
      )}

      {/* {showExpandHint && !expanded && <Text dimColor>Press Ctrl+O to expand</Text>}
      {showExpandHint && expanded && <Text dimColor>Press Ctrl+O to collapse</Text>} */}
    </Box>
  );
};
