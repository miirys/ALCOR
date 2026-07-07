import React from 'react';
import type { Message as MessageType } from '../types';
import { Markdown } from '../lib/components/Markdown';
import { CHROME_ROWS } from '../constants';

// ANSI dim + reset-dim around the indicator so it renders subdued without a flex row
const DIM_INDICATOR = '\x1b[2m● \x1b[22m';

interface AssistantMessageProps {
  message: MessageType;
  columns?: number;
  rows?: number;
}

export const AssistantMessage: React.FC<AssistantMessageProps> = ({
  message,
  columns = 80,
  rows,
}) => {
  if (!message.content) {
    // We often get empty assistant messages
    return null;
  }
  // During streaming, cap visible lines to available terminal height so the live section
  // stays fixed-size and Ink's erase+redraw cycle doesn't cause visible flickering.
  const maxLines = !message.isComplete && rows ? Math.max(5, rows - CHROME_ROWS) : undefined;
  // -2 reserves two columns for the ● indicator + space so wrapped lines don't overflow
  return (
    <Markdown
      markdown={message.content}
      availableWidth={Math.max(10, columns - 2)}
      prefix={DIM_INDICATOR}
      maxLines={maxLines}
    />
  );
};
