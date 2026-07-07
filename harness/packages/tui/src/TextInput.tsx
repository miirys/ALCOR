import React, { useEffect, useRef, useState } from 'react';
import type { AppCallbacks, TextInputState } from './types';
import { MultilineTextInput } from './lib/components/MultilineTextInput';
import { useInputAction, usePublishInputContext } from './lib/keymap';
import { TextBuffer } from './lib/text_buffer';
import { useInputDropdown } from './lib/hooks/use_input_dropdown';
import type { DropdownProvider } from './lib/dropdown_provider';

interface TextInputProps {
  input: TextInputState;
  callbacks: AppCallbacks;
  dropdownProviders?: DropdownProvider[];
  onDropdownOpenChange?: (open: boolean) => void;
  title?: string;
  borderColor?: string;
  promptPrefix?: string;
  /**
   * True while the onboarding card is on screen. The card owns ↑/↓ (via the
   * keymap) while the message is empty, so the input must not also consume them
   * for history/cursor navigation — otherwise both fire on the same keypress.
   */
  onboardingActive?: boolean;
  /** Notifies the parent whenever the message's empty state changes. */
  onMessageEmptyChange?: (empty: boolean) => void;
}

export const TextInput: React.FC<TextInputProps> = ({
  input,
  callbacks,
  dropdownProviders = [],
  onDropdownOpenChange,
  title,
  borderColor,
  promptPrefix,
  onboardingActive = false,
  onMessageEmptyChange,
}) => {
  const [message, setMessage] = useState(input.lines.join('\n'));

  const textBufferRef = useRef(new TextBuffer(message));
  const previousInputLinesRef = useRef(input.lines);

  const dropdown = useInputDropdown(
    textBufferRef,
    dropdownProviders,
    setMessage,
    // Use textBufferRef.current.text rather than the `message` state variable,
    // because the buffer has already been mutated by replaceWordAtCursor but
    // the React state update from setMessage hasn't re-rendered yet.
    // The dropdown is already closed by handleItemInsert before this runs,
    // so we only need to reset the message state here.
    async () => {
      await callbacks.onSubmit(textBufferRef.current.text);
      setMessage('');
    },
  );

  // Lift the dropdown-open flag to the parent so the status bar footer can
  // derive its hint from it (dropdown state is local to this input).
  useEffect(() => {
    onDropdownOpenChange?.(dropdown.isOpen);
  }, [onDropdownOpenChange, dropdown.isOpen]);

  useEffect(() => {
    const newMessage = input.lines.join('\n');
    const previousMessage = previousInputLinesRef.current.join('\n');

    if (newMessage !== previousMessage) {
      setMessage(newMessage);
      textBufferRef.current.setText(newMessage);
      previousInputLinesRef.current = input.lines;
    }
  }, [input.lines]);

  const resetState = () => {
    setMessage('');
    dropdown.close();
  };

  const messageEmpty = message.trim() === '';

  // Publish whether the message is empty so Ctrl+C resolves to clear vs. exit.
  usePublishInputContext({ messageEmpty });

  // Mirror the empty state up so siblings (e.g. the onboarding card) can react.
  useEffect(() => {
    onMessageEmptyChange?.(messageEmpty);
  }, [messageEmpty, onMessageEmptyChange]);

  // Hand ↑/↓ to whoever owns them: the dropdown when open, or the onboarding
  // card while it's shown and the message is empty (matching the keymap gate).
  const arrowsOwnedElsewhere = dropdown.isOpen || (onboardingActive && messageEmpty);

  // Ctrl+C with a non-empty message clears the input (dropdown-open Ctrl+C and
  // app exit are owned by the dropdown and ChatInterface respectively).
  useInputAction('input.clear', resetState);

  useInputAction('input.submit', async () => {
    const streamingComplete = callbacks.onSubmit(message);
    resetState();
    await streamingComplete;
  });

  const handleChange = async (newValue: string) => {
    setMessage(newValue);
    await callbacks.onTextChange(newValue);

    textBufferRef.current.setText(newValue);
    await dropdown.onTextChange(newValue);
  };

  return (
    <>
      <MultilineTextInput
        value={message}
        onChange={handleChange}
        placeholder="Ask ALCOR anything… ( / for commands · Ctrl+C to exit )"
        ignoreKeys={arrowsOwnedElsewhere ? ['up', 'down'] : []}
        initialTextBuffer={textBufferRef.current}
        onHistoryPrevious={callbacks.onHistoryPrevious}
        onHistoryNext={callbacks.onHistoryNext}
        title={title}
        borderColor={borderColor}
        promptPrefix={promptPrefix}
      />

      {dropdown.renderDropdown()}
    </>
  );
};
