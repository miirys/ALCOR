import React, { useState } from 'react';
import { Box, Text } from 'ink';
import type { SettingsInputState, SettingsItem, SettingsOption } from '../types';
import { useKeyHandler } from '../lib/key_handler';
import { colors } from '../lib/colors';

export const settingsFooterHint = (): string | null =>
  '↑/↓ to navigate • Enter/Space to change • Esc to close';

export interface SettingsCallbacks {
  onToggle: (key: string) => void;
  /** Select a value for a non-boolean selector item. */
  onSelect?: (key: string, value: string) => void;
  onClose: () => void;
}

/** Returns the option value after `current`, wrapping around to the first. */
const nextOptionValue = (options: SettingsOption[], current: string | undefined): string => {
  const index = options.findIndex((option) => option.value === current);
  return options[(index + 1) % options.length].value;
};

/** The label shown on the right of an item: the selected option, or on/off for toggles. */
const itemStatus = (item: SettingsItem): { text: string; color: string } => {
  if (item.options) {
    const selected = item.options.find((option) => option.value === item.value);
    return { text: selected?.label ?? item.value, color: colors.cyan };
  }
  return item.enabled
    ? { text: '◉ on', color: colors.green }
    : { text: '○ off', color: colors.faint };
};

interface SettingsInputProps {
  input: SettingsInputState;
  callbacks: SettingsCallbacks;
}

export const SettingsInput: React.FC<SettingsInputProps> = ({ input, callbacks }) => {
  const [selectedIndex, setSelectedIndex] = useState(input.selectedIndex);

  useKeyHandler((event) => {
    if (event.eventType !== 'press') return;

    if (event.name === 'escape' || (event.ctrl && event.name === 'c')) {
      callbacks.onClose();
      event.stopPropagation();
      return;
    }

    if (event.name === 'return' || event.name === 'space') {
      const item = input.items[selectedIndex];
      if (item?.options) {
        callbacks.onSelect?.(item.key, nextOptionValue(item.options, item.value));
      } else if (item) {
        callbacks.onToggle(item.key);
      }
      event.stopPropagation();
      return;
    }

    if (event.name === 'up' && selectedIndex > 0) {
      setSelectedIndex(selectedIndex - 1);
      event.stopPropagation();
      return;
    }

    if (event.name === 'down' && selectedIndex < input.items.length - 1) {
      setSelectedIndex(selectedIndex + 1);
      event.stopPropagation();
    }
  });

  const selectedItem = input.items[selectedIndex];

  return (
    <Box flexDirection="column">
      <Box
        borderStyle="round"
        borderColor={colors.borderActive}
        paddingX={2}
        paddingY={1}
        flexDirection="column"
      >
        <Box marginBottom={1}>
          <Text bold color={colors.accent}>
            ◈ Settings
          </Text>
        </Box>

        <Box flexDirection="column" marginBottom={1}>
          {input.items.map((item, index) => {
            const isSelected = index === selectedIndex;
            const status = itemStatus(item);
            return (
              <Box key={item.key} gap={1}>
                <Text color={isSelected ? colors.accent : colors.faint}>
                  {isSelected ? '▌' : ' '}
                </Text>
                <Box width={30}>
                  <Text bold={isSelected} color={isSelected ? colors.bright : colors.fg}>
                    {item.label}
                  </Text>
                </Box>
                <Text color={status.color}>{status.text}</Text>
              </Box>
            );
          })}
        </Box>

        {selectedItem && (
          <Box>
            <Text dimColor>{selectedItem.description}</Text>
          </Box>
        )}
      </Box>
    </Box>
  );
};
