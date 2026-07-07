import React, { useRef, useState } from 'react';
import { Box, Text } from 'ink';
import type { AppCallbacks, ToolRejectionReasonInputState } from './types';
import { MultilineTextInput } from './lib/components/MultilineTextInput';
import { useKeyHandler } from './lib/key_handler';
import { KeyChecks } from './lib/input/unified';
import { TextBuffer } from './lib/text_buffer';

export const toolRejectionFooterHint = (): string | null =>
  'Enter to submit rejection • Esc to go back';

interface ToolRejectionReasonInputProps {
  input: ToolRejectionReasonInputState;
  callbacks: AppCallbacks;
}

export const ToolRejectionReasonInput: React.FC<ToolRejectionReasonInputProps> = ({
  input,
  callbacks,
}) => {
  const [text, setText] = useState('');
  const textBufferRef = useRef(new TextBuffer(''));

  useKeyHandler((event) => {
    if (event.eventType !== 'press') return;

    if (KeyChecks.isEnter(event)) {
      callbacks.onSubmitRejectionReason(text);
      event.stopPropagation();
      return;
    }

    if (event.name === 'escape') {
      callbacks.onCancelRejectionReason();
      event.stopPropagation();
    }
  });

  return (
    <Box flexDirection="column">
      <Box paddingX={1}>
        <Text color="dim">Reason for rejecting {input.toolName} (optional, Enter to skip):</Text>
      </Box>

      <MultilineTextInput
        value={text}
        onChange={setText}
        placeholder="Type a reason..."
        initialTextBuffer={textBufferRef.current}
        maxVisibleLines={3}
      />
    </Box>
  );
};
