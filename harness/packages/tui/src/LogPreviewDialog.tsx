import React, { useEffect, useState } from 'react';
import { Box, Text, useStdout } from 'ink';
import stringWidth from 'string-width';
import type { LogPreviewDialogInputState } from './types';
import { useKeyHandler } from './lib/key_handler';

const isLogContentEmpty = (logContent: string): boolean => {
  const lines = logContent.split('\n');
  return lines.length === 1 && lines[0] === '';
};

export const logPreviewFooterHint = (logContent: string): string | null =>
  isLogContentEmpty(logContent)
    ? 'Esc to close'
    : '↑ older • ↓ newer • Home/End to jump • Esc to close';

export interface LogPreviewDialogCallbacks extends Record<string, (...args: unknown[]) => unknown> {
  onCloseLogPreview: () => void;
}

interface LogPreviewDialogProps {
  input: LogPreviewDialogInputState;
  callbacks: LogPreviewDialogCallbacks;
}

// Interface for a visual row after wrapping
interface VisualRow {
  text: string;
  sourceLineIndex: number;
}

// Helper: Wrap a single line into visual rows based on available width
const wrapLineToRows = (line: string, availableWidth: number): string[] => {
  if (!line || line.length === 0) return [''];

  const lineWidth = stringWidth(line);

  // If line fits in one row, return as-is
  if (lineWidth <= availableWidth) {
    return [line];
  }

  // Split line into rows
  const rows: string[] = [];
  let currentRow = '';
  let currentWidth = 0;

  for (const char of line) {
    const charWidth = stringWidth(char);

    // If adding this char would exceed width, start new row
    if (currentWidth + charWidth > availableWidth && currentRow.length > 0) {
      rows.push(currentRow);
      currentRow = char;
      currentWidth = charWidth;
    } else {
      currentRow += char;
      currentWidth += charWidth;
    }
  }

  // Add final row
  if (currentRow.length > 0) {
    rows.push(currentRow);
  }

  return rows.length > 0 ? rows : [''];
};

// Helper: Build flat array of visual rows from log lines
const buildVisualRowMap = (lines: string[], availableWidth: number): VisualRow[] => {
  const visualRows: VisualRow[] = [];

  lines.forEach((line, sourceLineIndex) => {
    const wrappedRows = wrapLineToRows(line, availableWidth);
    wrappedRows.forEach((text) => {
      visualRows.push({ text, sourceLineIndex });
    });
  });

  return visualRows;
};

// Helper: Shared layout component for both empty and normal log states
interface LogPreviewLayoutProps {
  children: React.ReactNode;
}

const LogPreviewLayout: React.FC<LogPreviewLayoutProps> = ({ children }) => (
  <Box flexDirection="column">
    <Box borderStyle="round" borderColor="cyan" paddingX={2} paddingY={1} flexDirection="column">
      <Box marginBottom={1}>
        <Text bold color="cyan">
          Recent ALCOR Logs
        </Text>
      </Box>
      {children}
    </Box>
  </Box>
);

export const LogPreviewDialog: React.FC<LogPreviewDialogProps> = ({ input, callbacks }) => {
  const logLines = input.logContent.split('\n');
  const isEmpty = isLogContentEmpty(input.logContent);

  // ALL HOOKS MUST BE CALLED BEFORE ANY EARLY RETURNS (Rules of Hooks)
  const { stdout } = useStdout();
  const terminalWidth = stdout?.columns ?? 80;

  // Fixed budget: 15 total rows - 2 for indicators = 13 for content
  const maxContentRows = 13;

  // Calculate available width for wrapping (account for box padding + border)
  // Round border uses more space than single border
  const availableWidth = Math.max(1, terminalWidth - 6);

  // Build visual row map
  const visualRows = buildVisualRowMap(logLines, availableWidth);

  // State: which visual row is at the top of the viewport
  // Initialize to show bottom (most recent logs)
  const maxOffset = Math.max(0, visualRows.length - maxContentRows);
  const [viewportTopRowOffset, setViewportTopRowOffset] = useState(maxOffset);

  // Reset viewport to bottom when dialog opens
  useEffect(() => {
    const newMaxOffset = Math.max(0, visualRows.length - maxContentRows);
    setViewportTopRowOffset(newMaxOffset);
  }, [input.logContent]); // Reset when log content changes

  // Calculate what's visible in current viewport
  const currentMaxOffset = Math.max(0, visualRows.length - maxContentRows);
  const clampedOffset = Math.min(viewportTopRowOffset, currentMaxOffset);
  const visibleRows = visualRows.slice(clampedOffset, clampedOffset + maxContentRows);

  // Determine if we show scroll indicators
  const showScrollUp = clampedOffset > 0;
  const showScrollDown = clampedOffset + maxContentRows < visualRows.length;

  // Key handlers: visual-row scrolling
  useKeyHandler((event) => {
    if (event.eventType !== 'press') return;

    // Up arrow: scroll up by one visual row (show older logs)
    if (event.name === 'up') {
      setViewportTopRowOffset((prev) => Math.max(0, prev - 1));
      event.stopPropagation();
      return;
    }

    // Down arrow: scroll down by one visual row (show newer logs)
    if (event.name === 'down') {
      setViewportTopRowOffset((prev) => Math.min(currentMaxOffset, prev + 1));
      event.stopPropagation();
      return;
    }

    // Home: jump to top (oldest logs)
    if (event.name === 'home') {
      setViewportTopRowOffset(0);
      event.stopPropagation();
      return;
    }

    // End: jump to bottom (newest logs)
    if (event.name === 'end') {
      setViewportTopRowOffset(currentMaxOffset);
      event.stopPropagation();
      return;
    }

    if (event.name === 'escape') {
      callbacks.onCloseLogPreview();
      event.stopPropagation();
    }
  });

  // Handle empty logs edge case AFTER all hooks
  if (isEmpty) {
    return (
      <LogPreviewLayout>
        <Text color="dim">No logs available</Text>
      </LogPreviewLayout>
    );
  }

  return (
    <LogPreviewLayout>
      <Box marginBottom={1}>
        <Text color="dim">Last 200 lines from {input.logFilePath}</Text>
      </Box>

      <Box flexDirection="column">
        {/* Top indicator: show when we can scroll up to see older logs */}
        {showScrollUp && (
          <Box marginBottom={1}>
            <Text color="yellow">▲ Older logs above...</Text>
          </Box>
        )}

        {/* Visible visual rows */}
        {visibleRows.map((row, index) => (
          <Text key={clampedOffset + index}>{row.text || ' '}</Text>
        ))}

        {/* Bottom indicator: show when we can scroll down to see newer logs */}
        {showScrollDown && (
          <Box marginTop={1}>
            <Text color="yellow">▼ Newer logs below...</Text>
          </Box>
        )}
      </Box>
    </LogPreviewLayout>
  );
};
