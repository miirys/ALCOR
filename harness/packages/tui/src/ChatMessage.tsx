import React from 'react';
import { Box } from 'ink';
import { UserMessage } from './messages/UserMessage';
import { AssistantMessage } from './messages/AssistantMessage';
import { Tool } from './messages/tools/Tool';
import { ErrorMessage } from './ErrorMessage';
import { InfoMessage } from './InfoMessage';
import type { ChatElement } from './types';

interface ChatMessageProps {
  element: ChatElement;
  expanded: boolean;
  columns?: number;
  rows?: number;
}

/**
 * Renders a single chat element and owns its own bottom margin.
 * Returns null for empty assistant messages so no space is consumed at all —
 * the backend sometimes emits assistant messages before the first text chunk arrives.
 */
export const ChatMessage: React.FC<ChatMessageProps> = ({ element, expanded, columns, rows }) => {
  if (element.type === 'message') {
    if (element.role === 'assistant' && !element.content) {
      // Empty assistant messages render nothing — returning null here means no
      // wrapper Box is created, so there's no phantom margin or blank line.
      return null;
    }
    return (
      <Box marginBottom={1}>
        {element.role === 'user' ? (
          <UserMessage message={element} columns={columns} />
        ) : (
          <AssistantMessage message={element} columns={columns} rows={rows} />
        )}
      </Box>
    );
  }
  if (element.type === 'error') {
    return (
      <Box marginBottom={1}>
        <ErrorMessage error={element.error} />
      </Box>
    );
  }
  if (element.type === 'info') {
    return (
      <Box marginBottom={1}>
        <InfoMessage message={element.message} />
      </Box>
    );
  }
  if (element.type === 'tool') {
    return (
      <Box marginBottom={1}>
        <Tool tool={element} expanded={expanded} columns={columns} />
      </Box>
    );
  }
  return null;
};
