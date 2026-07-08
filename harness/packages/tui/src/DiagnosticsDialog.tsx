import React from 'react';
import { Box, Text, useStdout } from 'ink';
import type { DiagnosticsDialogInputState } from './types';
import { Markdown } from './lib/components/Markdown';
import { useKeyHandler } from './lib/key_handler';

export const diagnosticsFooterHint = (): string | null => 'Esc to close';

export interface DiagnosticsDialogCallbacks {
  onClose: () => void;
}

interface DiagnosticsDialogProps {
  input: DiagnosticsDialogInputState;
  callbacks: DiagnosticsDialogCallbacks;
}

export const DiagnosticsDialog: React.FC<DiagnosticsDialogProps> = ({ input, callbacks }) => {
  const { stdout } = useStdout();
  const columns = stdout?.columns ?? 80;

  useKeyHandler((event) => {
    if (event.eventType !== 'press') return;
    if (event.name === 'escape') {
      callbacks.onClose();
      event.stopPropagation();
    }
  });

  return (
    <Box flexDirection="column">
      <Box
        borderStyle="round"
        borderColor="#4a4a56"
        paddingX={2}
        paddingY={1}
        flexDirection="column"
      >
        <Box marginBottom={1}>
          <Text bold color="#e8e8ee">
            ALCOR — Diagnostics
          </Text>
        </Box>
        <Markdown markdown={input.content} availableWidth={Math.max(10, columns - 6)} />
      </Box>
    </Box>
  );
};
