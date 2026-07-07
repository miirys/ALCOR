import React, { useState, useEffect } from 'react';
import { Box, Text } from 'ink';
import type { AppCallbacks, ChoiceInputState } from './types';
import { useKeyHandler } from './lib/key_handler';
import { colors } from './lib/colors';

interface ChoiceInputProps {
  input: ChoiceInputState;
  callbacks: AppCallbacks;
}

export const ChoiceInput: React.FC<ChoiceInputProps> = ({ input, callbacks }) => {
  const options = input.choiceOptions || [];
  const [selectedIndex, setSelectedIndex] = useState(input.selectedChoiceIndex ?? 0);

  // Sync with prop changes (when state is updated externally)
  useEffect(() => {
    setSelectedIndex(input.selectedChoiceIndex ?? 0);
  }, [input.selectedChoiceIndex]);

  useKeyHandler((event) => {
    if (event.eventType !== 'press') return;

    if (event.name === 'up') {
      setSelectedIndex((prev) => Math.max(0, prev - 1));
      event.stopPropagation();
      return;
    }

    if (event.name === 'down') {
      setSelectedIndex((prev) => Math.min(options.length - 1, prev + 1));
      event.stopPropagation();
      return;
    }

    if (event.name === 'return') {
      callbacks.onChoiceSubmit(options[selectedIndex]?.value);
      event.stopPropagation();
    }
  });

  return (
    // marginBottom creates a blank row between the options list and the status bar footer
    <Box flexDirection="column" marginBottom={1}>
      <Box flexDirection="column" paddingLeft={2}>
        {options.map((option, index) => {
          const isSelected = index === selectedIndex;
          return (
            <Box key={index} flexDirection="column">
              <Box>
                {/* ❯ indicator shifts with selection; two spaces preserve alignment when unselected */}
                <Text color={isSelected ? colors.accent : colors.fg} bold={isSelected}>
                  {isSelected ? '❯ ' : '  '}
                  {option.label}
                </Text>
                {option.description && <Text dimColor> · {option.description}</Text>}
              </Box>
              {option.secondaryLabel && (
                <Box paddingLeft={4}>
                  <Text color={isSelected ? colors.accent : undefined} dimColor={!isSelected}>
                    {option.secondaryLabel}
                  </Text>
                </Box>
              )}
            </Box>
          );
        })}
      </Box>
    </Box>
  );
};
