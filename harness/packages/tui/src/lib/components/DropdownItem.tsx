import { Box, Text } from 'ink';
import { colors } from '../colors';

export interface DropdownItem {
  id: string;
  label: string;
  description?: string;
  enabled: boolean;
  disabledReason?: string;
  /** Text to substitute for the current word at cursor when this item is selected. */
  replaceWith: string;
  /**
   * When true and the host provides an onSubmit handler, selecting this item
   * via Enter will also submit the form. Tab always inserts only, regardless
   * of this flag.
   *
   * Note: This is a per-item property rather than a Dropdown-level setting
   * because different providers may have different submission behaviors.
   * For example, slash commands should submit immediately on Enter, while
   * file context items should only insert into the input.
   */
  submitAfterSelect?: boolean;
}

export interface DropdownItemProps {
  item: DropdownItem;
  isSelected: boolean;
}

export function DropdownItemComponent({ item, isSelected }: DropdownItemProps) {
  const isDisabled = !item.enabled;

  return (
    <Box>
      <Text color={isSelected ? colors.accent : colors.faint}>{isSelected ? '▌ ' : '  '}</Text>
      <Box width={item.description ? 16 : 'relative'}>
        <Text
          color={isSelected ? colors.bright : colors.fg}
          bold={isSelected}
          dimColor={isDisabled}
        >
          {item.label}
        </Text>
      </Box>
      {item.description && (
        <Box>
          <Text dimColor>{item.description}</Text>
        </Box>
      )}
      {isDisabled && item.disabledReason && (
        <Box>
          <Text dimColor> {item.disabledReason}</Text>
        </Box>
      )}
    </Box>
  );
}
