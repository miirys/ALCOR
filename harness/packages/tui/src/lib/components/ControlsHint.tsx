import React from 'react';
import { Text } from 'ink';
import { Markdown } from './Markdown';

interface ControlsHintProps {
  children: string;
}

export const ControlsHint: React.FC<ControlsHintProps> = ({ children }) => {
  return (
    <Text dimColor>
      <Markdown markdown={children} />
    </Text>
  );
};
