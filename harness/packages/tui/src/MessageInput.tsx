import React from 'react';
import { TextInput } from './TextInput';
import { ChoiceInput } from './ChoiceInput';
import { HistorySearchInput } from './HistorySearchInput';
import { ToolRejectionReasonInput } from './ToolRejectionReasonInput';
import type { InputState, AppCallbacks } from './types';
import type { DropdownProvider } from './lib/dropdown_provider';
import { CLI_INPUT_TYPES } from './constants';
import { useCommandComponentRegistry } from './lib/command_component_registry';

interface MessageInputProps {
  input: InputState;
  callbacks: AppCallbacks;
  dropdownProviders?: DropdownProvider[];
  /** Notifies the parent when the inline dropdown opens or closes. */
  onDropdownOpenChange?: (open: boolean) => void;
  title?: string;
  borderColor?: string;
  promptPrefix?: string;
  onboardingActive?: boolean;
  onMessageEmptyChange?: (empty: boolean) => void;
}

export const InputComponent: React.FC<MessageInputProps> = ({
  input,
  callbacks,
  dropdownProviders,
  onDropdownOpenChange,
  title,
  borderColor,
  promptPrefix,
  onboardingActive,
  onMessageEmptyChange,
}) => {
  const commandRegistry = useCommandComponentRegistry();

  switch (input.inputType) {
    case CLI_INPUT_TYPES.TEXT:
      return (
        <TextInput
          input={input}
          callbacks={callbacks}
          dropdownProviders={dropdownProviders}
          onDropdownOpenChange={onDropdownOpenChange}
          title={title}
          borderColor={borderColor}
          promptPrefix={promptPrefix}
          onboardingActive={onboardingActive}
          onMessageEmptyChange={onMessageEmptyChange}
        />
      );
    case CLI_INPUT_TYPES.CHOICE:
      return <ChoiceInput input={input} callbacks={callbacks} />;
    case CLI_INPUT_TYPES.PROMPT_HISTORY_SEARCH:
      return <HistorySearchInput input={input} callbacks={callbacks} />;
    case CLI_INPUT_TYPES.TOOL_REJECTION_REASON:
      return <ToolRejectionReasonInput input={input} callbacks={callbacks} />;
    default: {
      const entry = commandRegistry.get(input.inputType);
      if (entry) {
        const { component: Component, callbacks: commandCallbacks } = entry;
        return <Component input={input} callbacks={commandCallbacks} />;
      }
      return null;
    }
  }
};
